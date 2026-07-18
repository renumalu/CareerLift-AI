import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateFeedback, generateQuestion, generateTips, normalizeQuestion, TOTAL_QUESTIONS } from "./interview-ai.server";

const Difficulty = z.enum(["easy", "medium", "hard"]);

export const startInterviewSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        role: z.string().min(2).max(120),
        difficulty: Difficulty,
        strictNoRepeat: z.boolean().optional().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: session, error } = await context.supabase
      .from("interview_sessions")
      .insert({
        user_id: context.userId,
        role: data.role,
        difficulty: data.difficulty,
        strict_no_repeat: data.strictNoRepeat,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Pull prior questions across previous sessions for this user+role
    // (and difficulty when strict) so we don't repeat.
    let historyQuery = context.supabase
      .from("interview_answers")
      .select("question, question_type, interview_sessions!inner(role, difficulty, user_id)")
      .eq("interview_sessions.user_id", context.userId)
      .eq("interview_sessions.role", data.role)
      .order("created_at", { ascending: false })
      .limit(data.strictNoRepeat ? 500 : 50);
    if (data.strictNoRepeat) {
      historyQuery = historyQuery.eq("interview_sessions.difficulty", data.difficulty);
    }
    const { data: history } = await historyQuery;

    const prior = (history ?? []).map((h: { question: string; question_type: string }) => ({
      question: h.question,
      type: h.question_type,
    }));

    const question = await generateQuestion(data.role, data.difficulty, prior, 0, data.strictNoRepeat);

    const { data: qRow, error: qErr } = await context.supabase
      .from("interview_answers")
      .insert({
        session_id: session.id,
        user_id: context.userId,
        question_index: 0,
        question: question.question,
        question_type: question.type,
      })
      .select("*")
      .single();
    if (qErr) throw new Error(qErr.message);

    return { session, currentQuestion: qRow, total: TOTAL_QUESTIONS };
  });


export const submitAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        answerId: z.string().uuid(),
        answer: z.string().min(1).max(8000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Load session + current question
    const { data: session, error: sErr } = await context.supabase
      .from("interview_sessions")
      .select("*")
      .eq("id", data.sessionId)
      .single();
    if (sErr) throw new Error(sErr.message);

    const { data: current, error: cErr } = await context.supabase
      .from("interview_answers")
      .select("*")
      .eq("id", data.answerId)
      .single();
    if (cErr) throw new Error(cErr.message);

    const parsed = await generateFeedback({
      role: session.role,
      difficulty: session.difficulty,
      questionType: current.question_type,
      question: current.question,
      answer: data.answer,
    });
    const score = Math.max(0, Math.min(10, Math.round(parsed.score)));

    const { error: uErr } = await context.supabase
      .from("interview_answers")
      .update({
        answer: data.answer,
        score,
        feedback: { strengths: parsed.strengths, missing: parsed.missing, categories: parsed.categories ?? null },
        star_analysis: parsed.star_analysis,
      })
      .eq("id", data.answerId);
    if (uErr) throw new Error(uErr.message);

    const nextIndex = current.question_index + 1;

    if (nextIndex >= TOTAL_QUESTIONS) {
      // Build session summary
      const { data: answers } = await context.supabase
        .from("interview_answers")
        .select("*")
        .eq("session_id", data.sessionId)
        .order("question_index", { ascending: true });
      const scored = (answers ?? []).filter((a) => typeof a.score === "number");
      const avg = scored.length ? scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length : 0;
      const strongest = scored.reduce((best, a) => ((a.score ?? -1) > (best?.score ?? -1) ? a : best), scored[0]);
      const weakest = scored.reduce((worst, a) => ((a.score ?? 99) < (worst?.score ?? 99) ? a : worst), scored[0]);

      // Per-category averages
      const catKeys = ["communication", "technical_depth", "clarity", "structure"] as const;
      const catAgg: Record<string, { sum: number; n: number }> = {};
      catKeys.forEach((k) => (catAgg[k] = { sum: 0, n: 0 }));
      for (const a of scored) {
        const cats = (a.feedback as { categories?: Record<string, number> } | null)?.categories;
        if (!cats) continue;
        for (const k of catKeys) {
          const v = cats[k];
          if (typeof v === "number") {
            catAgg[k].sum += v;
            catAgg[k].n += 1;
          }
        }
      }
      const category_averages: Record<string, number> = {};
      for (const k of catKeys) {
        category_averages[k] = catAgg[k].n
          ? Math.round((catAgg[k].sum / catAgg[k].n) * 10) / 10
          : 0;
      }

      const tips = await generateTips({
        role: session.role,
        difficulty: session.difficulty,
        transcript: (answers ?? [])
          .map(
            (a, i) =>
              `Q${i + 1} [${a.question_type}]: ${a.question}\nA${i + 1} (score ${a.score}): ${a.answer ?? ""}`,
          )
          .join("\n\n"),
      });

      const summary = {
        average_score: Math.round(avg * 10) / 10,
        strongest: strongest ? { question: strongest.question, score: strongest.score } : null,
        weakest: weakest ? { question: weakest.question, score: weakest.score } : null,
        category_averages,
        tips,
      };

      await context.supabase
        .from("interview_sessions")
        .update({ completed: true, summary })
        .eq("id", data.sessionId);

      return { done: true, feedback: { ...parsed, score }, summary };
    }

    // Prior questions in this session
    const { data: currentSessionPrior } = await context.supabase
      .from("interview_answers")
      .select("question, question_type")
      .eq("session_id", data.sessionId)
      .order("question_index", { ascending: true });

    const strict = Boolean(session.strict_no_repeat);

    // Prior questions across the user's other sessions for the same role
    // (and difficulty when strict mode is on).
    let crossQuery = context.supabase
      .from("interview_answers")
      .select("question, question_type, interview_sessions!inner(role, difficulty, user_id)")
      .eq("interview_sessions.user_id", context.userId)
      .eq("interview_sessions.role", session.role)
      .neq("session_id", data.sessionId)
      .order("created_at", { ascending: false })
      .limit(strict ? 500 : 50);
    if (strict) {
      crossQuery = crossQuery.eq("interview_sessions.difficulty", session.difficulty);
    }
    const { data: crossSessionPrior } = await crossQuery;

    const seen = new Set<string>();
    const prior: { question: string; type: string }[] = [];
    for (const row of [...(currentSessionPrior ?? []), ...(crossSessionPrior ?? [])]) {
      const key = normalizeQuestion(row.question);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      prior.push({ question: row.question, type: row.question_type });
    }

    const next = await generateQuestion(session.role, session.difficulty, prior, nextIndex, strict);


    const { data: nextRow, error: nErr } = await context.supabase
      .from("interview_answers")
      .insert({
        session_id: data.sessionId,
        user_id: context.userId,
        question_index: nextIndex,
        question: next.question,
        question_type: next.type,
      })
      .select("*")
      .single();
    if (nErr) throw new Error(nErr.message);

    return { done: false, feedback: { ...parsed, score }, nextQuestion: nextRow };
  });

export const listInterviewSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("interview_sessions")
      .select("id, role, difficulty, completed, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getInterviewSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: session, error } = await context.supabase
      .from("interview_sessions")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: answers, error: aErr } = await context.supabase
      .from("interview_answers")
      .select("*")
      .eq("session_id", data.id)
      .order("question_index", { ascending: true });
    if (aErr) throw new Error(aErr.message);
    return { session, answers: answers ?? [] };
  });

async function deleteSessionsByIds(
  supabase: { from: (t: string) => any },
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const { count, error: cErr } = await supabase
    .from("interview_answers")
    .select("id", { count: "exact", head: true })
    .in("session_id", ids);
  if (cErr) throw new Error(cErr.message);
  const { error: dErr } = await supabase.from("interview_sessions").delete().in("id", ids);
  if (dErr) throw new Error(dErr.message);
  return count ?? 0;
}

export const resetRoleHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ role: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: sessions, error: sErr } = await context.supabase
      .from("interview_sessions")
      .select("id")
      .eq("user_id", context.userId)
      .ilike("role", data.role.trim());
    if (sErr) throw new Error(sErr.message);

    const ids = (sessions ?? []).map((s) => s.id);
    const questionsDeleted = await deleteSessionsByIds(context.supabase, ids);
    return { deletedSessions: ids.length, deletedQuestions: questionsDeleted };
  });

export const resetAllHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: sessions, error: sErr } = await context.supabase
      .from("interview_sessions")
      .select("id")
      .eq("user_id", context.userId);
    if (sErr) throw new Error(sErr.message);

    const ids = (sessions ?? []).map((s) => s.id);
    const questionsDeleted = await deleteSessionsByIds(context.supabase, ids);
    return { deletedSessions: ids.length, deletedQuestions: questionsDeleted };
  });
