import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ActivityItem = {
  id: string;
  kind: "resume" | "interview" | "application";
  title: string;
  subtitle?: string;
  score?: number;
  timestamp: string;
};

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function avg(nums: number[]) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

async function aiSummary(input: {
  overall: number;
  resume: number | null;
  interview: number | null;
  applications: number;
  daysSinceInterview: number | null;
  daysSinceResume: number | null;
  weakest: "resume" | "interview" | "applications";
}): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return fallbackSummary(input);
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are an encouraging, warm career coach. Given the user's job readiness metrics, respond with ONE sentence (max 28 words) that acknowledges a strength and points to the single most important next focus. Be human and specific, never robotic. Return ONLY JSON: {\"summary\":\"...\"}",
          },
          {
            role: "user",
            content: JSON.stringify(input),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return fallbackSummary(input);
    const data = await res.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
    return typeof parsed.summary === "string" && parsed.summary.length > 0
      ? parsed.summary
      : fallbackSummary(input);
  } catch {
    return fallbackSummary(input);
  }
}

function fallbackSummary(input: {
  overall: number;
  resume: number | null;
  interview: number | null;
  applications: number;
  weakest: "resume" | "interview" | "applications";
}) {
  const strength =
    input.resume && input.resume >= 75
      ? "Your resume matching is strong"
      : input.interview && input.interview >= 75
      ? "Your interview delivery is landing well"
      : input.applications >= 3
      ? "You're keeping up healthy application momentum"
      : "You're building good foundations";
  const focus =
    input.weakest === "resume"
      ? "sharpen your resume against a target role next"
      : input.weakest === "interview"
      ? "run a mock interview today to keep your reps up"
      : "log a few fresh applications to keep momentum going";
  return `${strength} — ${focus}.`;
}

export const getDashboardOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [resumesRes, sessionsRes, appsRes] = await Promise.all([
      supabase
        .from("resume_analyses")
        .select("id, overall_score, created_at, job_description")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("interview_sessions")
        .select("id, role, difficulty, completed, summary, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("job_applications")
        .select("id, company, role, status, applied_date, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (resumesRes.error) throw new Error(resumesRes.error.message);
    if (sessionsRes.error) throw new Error(sessionsRes.error.message);
    if (appsRes.error) throw new Error(appsRes.error.message);

    const resumes = resumesRes.data ?? [];
    const sessions = (sessionsRes.data ?? []).filter(
      (s) => s.completed && s.summary && typeof (s.summary as { average_score?: number }).average_score === "number",
    );
    const apps = appsRes.data ?? [];

    // Resume: last 3 overall scores
    const resumeRecent = resumes.slice(0, 3).map((r) => r.overall_score);
    const resumeAvg = avg(resumeRecent);

    // Interview: last 3 completed session avg scores (0-10 -> scale to 0-100)
    const interviewRecentRaw = sessions
      .slice(0, 3)
      .map((s) => (s.summary as { average_score: number }).average_score);
    const interviewAvg100 = interviewRecentRaw.length
      ? avg(interviewRecentRaw.map((n) => n * 10))
      : null;

    // Applications health: volume in last 14 days + interview conversion
    const cutoff14 = daysAgo(14);
    const recentApps = apps.filter((a) => a.created_at >= cutoff14);
    const volume = recentApps.length;
    // volume score: 5+ apps in 14 days = full 60 points of the app-health subscore
    const volumeScore = Math.min(1, volume / 5) * 60;
    const advanced = apps.filter((a) => a.status === "interview" || a.status === "offer").length;
    const conversion = apps.length ? advanced / apps.length : 0;
    // conversion: 25%+ conversion = full 40 points
    const conversionScore = Math.min(1, conversion / 0.25) * 40;
    const appHealth = apps.length === 0 ? 0 : Math.round(volumeScore + conversionScore);

    // Weighted overall
    const parts: { value: number; weight: number }[] = [];
    if (resumeAvg !== null) parts.push({ value: resumeAvg, weight: 0.4 });
    if (interviewAvg100 !== null) parts.push({ value: interviewAvg100, weight: 0.3 });
    if (apps.length > 0) parts.push({ value: appHealth, weight: 0.3 });

    const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
    const overall = totalWeight > 0
      ? Math.round(parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight)
      : 0;

    // Determine weakest area (of populated ones; if empty, that IS the weakest)
    const areaScores: Record<"resume" | "interview" | "applications", number> = {
      resume: resumeAvg ?? 0,
      interview: interviewAvg100 ?? 0,
      applications: apps.length ? appHealth : 0,
    };
    const weakest = (Object.entries(areaScores).sort((a, b) => a[1] - b[1])[0][0]) as
      | "resume"
      | "interview"
      | "applications";

    // Trend sparklines (oldest -> newest)
    const resumeTrend = resumes.slice(0, 6).reverse().map((r) => r.overall_score);
    const interviewTrend = sessions
      .slice(0, 6)
      .reverse()
      .map((s) => Math.round((s.summary as { average_score: number }).average_score * 10));

    // Combined timeseries (dashboard chart) — oldest -> newest, up to 10 points each
    const resumeSeries = resumes
      .slice(0, 10)
      .map((r) => ({ date: r.created_at, resume: r.overall_score as number | null, interview: null as number | null }))
      .reverse();
    const interviewSeries = sessions
      .slice(0, 10)
      .map((s) => ({
        date: s.created_at,
        resume: null as number | null,
        interview: Math.round((s.summary as { average_score: number }).average_score * 10) as number | null,
      }))
      .reverse();
    const timeseries = [...resumeSeries, ...interviewSeries]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((p) => ({
        date: new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        resume: p.resume,
        interview: p.interview,
      }));


    // Applications this week + prev week for delta
    const cutoff7 = daysAgo(7);
    const cutoff14b = daysAgo(14);
    const thisWeek = apps.filter((a) => a.created_at >= cutoff7).length;
    const prevWeek = apps.filter((a) => a.created_at >= cutoff14b && a.created_at < cutoff7).length;

    // Days since last activity
    const lastResumeAt = resumes[0]?.created_at ?? null;
    const lastInterviewAt = sessions[0]?.created_at ?? null;
    const daysSince = (iso: string | null) =>
      iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;

    // Recent activity feed (top 5 across all three)
    const activity: ActivityItem[] = [
      ...resumes.slice(0, 5).map((r) => ({
        id: `r-${r.id}`,
        kind: "resume" as const,
        title: "Analyzed a resume",
        subtitle: `Score ${r.overall_score} / 100`,
        score: r.overall_score,
        timestamp: r.created_at,
      })),
      ...sessions.slice(0, 5).map((s) => ({
        id: `s-${s.id}`,
        kind: "interview" as const,
        title: `Mock interview · ${s.role}`,
        subtitle: `Avg ${(s.summary as { average_score: number }).average_score}/10 · ${s.difficulty}`,
        score: Math.round((s.summary as { average_score: number }).average_score * 10),
        timestamp: s.created_at,
      })),
      ...apps.slice(0, 5).map((a) => ({
        id: `a-${a.id}`,
        kind: "application" as const,
        title: `Applied to ${a.company}`,
        subtitle: a.role,
        timestamp: a.created_at,
      })),
    ]
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      .slice(0, 5);

    const summary = await aiSummary({
      overall,
      resume: resumeAvg !== null ? Math.round(resumeAvg) : null,
      interview: interviewAvg100 !== null ? Math.round(interviewAvg100) : null,
      applications: thisWeek,
      daysSinceInterview: daysSince(lastInterviewAt),
      daysSinceResume: daysSince(lastResumeAt),
      weakest,
    });

    return {
      overall,
      summary,
      breakdown: {
        resume: resumeAvg !== null ? Math.round(resumeAvg) : null,
        interview: interviewAvg100 !== null ? Math.round(interviewAvg100) : null,
        applications: apps.length ? appHealth : null,
      },
      trends: {
        resume: resumeTrend,
        interview: interviewTrend,
      },
      timeseries,
      applications: {
        thisWeek,
        prevWeek,
        delta: thisWeek - prevWeek,
      },
      weakest,
      hasAnyData: resumes.length + sessions.length + apps.length > 0,
      activity,
    };
  });
