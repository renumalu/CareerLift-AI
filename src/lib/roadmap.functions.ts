import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Resource = { title: string; type: "course" | "docs" | "article" | "practice"; url: string };
type RoadmapItem = {
  topic: string;
  why: string;
  priority: "high" | "medium" | "low";
  resources: Resource[];
};

type RoadmapResponse = {
  items: RoadmapItem[];
  keywords: string[];
  hasData: boolean;
  hasResumeAnalysis: boolean;
  analysisCount: number;
  message?: string;
};

function resourceLinks(topic: string): Resource[] {
  const query = encodeURIComponent(topic);

  return [
    { title: `MDN docs: ${topic}`, type: "docs", url: `https://developer.mozilla.org/en-US/search?q=${query}` },
    { title: `freeCodeCamp guide: ${topic}`, type: "article", url: `https://www.freecodecamp.org/news/search/?query=${query}` },
    { title: `LeetCode practice: ${topic}`, type: "practice", url: `https://leetcode.com/problemset/?search=${query}` },
    { title: `Coursera course search: ${topic}`, type: "course", url: `https://www.coursera.org/search?query=${query}&productTypeDescription=Courses` },
  ];
}

async function fallbackRoadmap(keywords: string[]): Promise<RoadmapItem[]> {
  return keywords.slice(0, 5).map((k, i) => ({
    topic: k,
    why: `Recruiters flagged "${k}" as missing or weak in your recent resume analyses. Building it will lift your match score.`,
    priority: (i < 2 ? "high" : i < 4 ? "medium" : "low") as "high" | "medium" | "low",
    resources: resourceLinks(k),
  }));
}


export const getLearningRoadmap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RoadmapResponse> => {
    const { data: analyses, error } = await context.supabase
      .from("resume_analyses")
      .select("id, missing_keywords, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);

    const analysisCount = analyses?.length ?? 0;
    if (analysisCount === 0) {
      return {
        items: [],
        keywords: [],
        hasData: false,
        hasResumeAnalysis: false,
        analysisCount: 0,
        message: "Upload and analyze your resume first. The roadmap is locked until your own resume analysis exists.",
      };
    }

    const counts = new Map<string, number>();
    for (const a of analyses ?? []) {
      const kws = (a.missing_keywords as string[] | null) ?? [];
      for (const kw of kws) {
        const norm = String(kw).trim();
        if (!norm) continue;
        counts.set(norm, (counts.get(norm) ?? 0) + 1);
      }
    }
    const keywords = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([k]) => k);

    if (keywords.length === 0) {
      return {
        items: [],
        keywords: [],
        hasData: false,
        hasResumeAnalysis: true,
        analysisCount,
        message: "Your latest resume analysis did not return missing keywords, so there is no gap-based roadmap to build yet. Re-analyze with a detailed job description to generate one.",
      };
    }

    // Build from stored resume-analysis gaps without spending extra AI credits on page load.
    // The analyzer already produced the personalized missing keywords from this user's resume/JD.
    const items = await fallbackRoadmap(keywords);

    return { items, keywords, hasData: true, hasResumeAnalysis: true, analysisCount };
  });
