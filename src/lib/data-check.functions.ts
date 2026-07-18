import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDataCheckCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [apps, resumes, interviews] = await Promise.all([
      supabase.from("job_applications").select("*", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("resume_analyses").select("*", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("interview_sessions").select("*", { count: "exact", head: true }).eq("user_id", userId),
    ]);
    return {
      applications: apps.count ?? 0,
      resumeAnalyses: resumes.count ?? 0,
      interviewSessions: interviews.count ?? 0,
      checkedAt: new Date().toISOString(),
    };
  });
