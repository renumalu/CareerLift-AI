import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AnalyzeInput = z.object({
  resumeText: z.string().min(20).max(30000),
  jobDescription: z.string().min(20).max(20000),
  resumeFileUrl: z.string().optional(),
  resumeFileName: z.string().optional(),
});

const AnalysisResult = z.object({
  overall_score: z.number(),
  ats_score: z.number(),
  category_scores: z.object({
    skills_match: z.number(),
    experience_relevance: z.number(),
    ats_compatibility: z.number(),
    formatting_clarity: z.number(),
  }),
  missing_keywords: z.array(z.string()),
  ats_fixes: z.array(z.string()),
  suggestions: z.array(z.string()),
});

const SYSTEM_PROMPT = `You are an expert career coach, senior recruiter, and Applicant Tracking System (ATS) specialist. You review a candidate's resume against a target job description and produce a strict, honest, actionable analysis.

Return ONLY valid JSON matching exactly this schema, with no prose, no markdown, no code fences:
{
  "overall_score": <integer 0-100>,           // holistic match quality for THIS specific job
  "ats_score": <integer 0-100>,               // how well the resume will parse and rank in an ATS. Penalise heavily for: non-standard section headers, tables/columns/graphics, images or icons carrying info, header/footer content, unusual fonts, missing standard sections (Experience, Education, Skills), keyword absence.
  "category_scores": {
    "skills_match": <integer 0-100>,          // hard/soft skills overlap with the JD
    "experience_relevance": <integer 0-100>,  // depth and relevance of past roles vs the JD
    "ats_compatibility": <integer 0-100>,     // same criteria as ats_score, may match it
    "formatting_clarity": <integer 0-100>     // readability, conciseness, structure, grammar
  },
  "missing_keywords": [<string>, ...],        // 5-15 short (1-3 word) skills/tools/terms in the JD that are missing or weak in the resume
  "ats_fixes": [<string>, ...],               // 3-7 concrete, prioritised ATS-specific fixes. Each 1 sentence, imperative voice. Examples: "Replace the two-column layout with a single-column format so ATS parsers read your content in order.", "Rename 'My Journey' to a standard 'Experience' header.", "Move the phone number and email out of the header into the top of the body."
  "suggestions": [<string>, ...]              // 3-5 content improvement suggestions (bullet strength, quantifiable results, wording). Each 1-2 sentences.
}

Guidance:
- Be specific to what you actually see in the resume text. Cite section names, phrases, or bullets when useful.
- If the resume text looks like it came from a PDF with columns/tables, note it in ats_fixes.
- ats_fixes must be about ATS parsing/format; suggestions must be about content/impact. Do not duplicate between the two lists.`;

async function callLovableAI(resumeText: string, jobDescription: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const userPrompt = `JOB DESCRIPTION:\n"""\n${jobDescription}\n"""\n\nRESUME (extracted text):\n"""\n${resumeText}\n"""\n\nProduce the JSON analysis now.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-5.5",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Rate limit reached. Please try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in your workspace settings.");
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI returned invalid JSON");
  }

  const result = AnalysisResult.parse(parsed);
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  return {
    overall_score: clamp(result.overall_score),
    ats_score: clamp(result.ats_score),
    category_scores: {
      skills_match: clamp(result.category_scores.skills_match),
      experience_relevance: clamp(result.category_scores.experience_relevance),
      ats_compatibility: clamp(result.category_scores.ats_compatibility),
      formatting_clarity: clamp(result.category_scores.formatting_clarity),
    },
    missing_keywords: result.missing_keywords.slice(0, 20),
    ats_fixes: result.ats_fixes.slice(0, 10),
    suggestions: result.suggestions.slice(0, 6),
  };
}

export const analyzeResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalyzeInput.parse(input))
  .handler(async ({ data, context }) => {
    const analysis = await callLovableAI(data.resumeText, data.jobDescription);

    const { data: row, error } = await context.supabase
      .from("resume_analyses")
      .insert({
        user_id: context.userId,
        resume_text: data.resumeText,
        extracted_resume_text: data.resumeText,
        resume_file_url: data.resumeFileUrl ?? null,
        resume_file_name: data.resumeFileName ?? null,
        job_description: data.jobDescription,
        overall_score: analysis.overall_score,
        ats_score: analysis.ats_score,
        category_scores: analysis.category_scores,
        missing_keywords: analysis.missing_keywords,
        ats_fixes: analysis.ats_fixes,
        suggestions: analysis.suggestions,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return row;
  });

export const listResumeAnalyses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("resume_analyses")
      .select(
        "id, overall_score, ats_score, category_scores, created_at, job_description, resume_file_name",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getResumeAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("resume_analyses")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateAnalysisState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        addressed_suggestions: z.array(z.number()).optional(),
        addressed_ats_fixes: z.array(z.number()).optional(),
        dismissed_keywords: z.array(z.string()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      addressed_suggestions?: number[];
      addressed_ats_fixes?: number[];
      dismissed_keywords?: string[];
    } = {};
    if (data.addressed_suggestions) patch.addressed_suggestions = data.addressed_suggestions;
    if (data.addressed_ats_fixes) patch.addressed_ats_fixes = data.addressed_ats_fixes;
    if (data.dismissed_keywords) patch.dismissed_keywords = data.dismissed_keywords;
    const { error } = await context.supabase
      .from("resume_analyses")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
