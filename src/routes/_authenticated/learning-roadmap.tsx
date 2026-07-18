import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, GraduationCap, Loader2, LockKeyhole, Sparkles } from "lucide-react";
import { getLearningRoadmap } from "@/lib/roadmap.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/learning-roadmap")({
  head: () => ({
    meta: [
      { title: "AI Learning Roadmap — CareerLift AI" },
      { name: "description", content: "A personalized AI-generated study plan built from the missing skills across your resume analyses — close your gaps faster." },
      { property: "og:title", content: "AI Learning Roadmap — CareerLift AI" },
      { property: "og:description", content: "Personalized study plan built from your resume gap analyses." },
      { property: "og:url", content: "https://careerliftaiproj.lovable.app/learning-roadmap" },
    ],
    links: [{ rel: "canonical", href: "https://careerliftaiproj.lovable.app/learning-roadmap" }],
  }),
  component: LearningRoadmapPage,
});

type Priority = "high" | "medium" | "low";

const priorityStyle: Record<Priority, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-slate-100 text-slate-700 border-slate-200",
};

function LearningRoadmapPage() {
  const fetchFn = useServerFn(getLearningRoadmap);
  const { data, isLoading, error } = useQuery({
    queryKey: ["learning-roadmap"],
    queryFn: () => fetchFn(),
    staleTime: 60_000,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-display text-3xl font-semibold">
          <GraduationCap className="h-7 w-7 text-teal-500" /> Learning Roadmap
        </h1>
        <p className="mt-1 text-muted-foreground">
          Personalised topics and resources based on the skills missing from your recent resume analyses.
        </p>
      </header>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Building your roadmap…
        </div>
      )}

      {error && (
        <Card className="p-6 text-sm text-red-600">
          Failed to build roadmap: {error instanceof Error ? error.message : "Unknown error"}
        </Card>
      )}

      {data && !data.hasData && (
        <Card className="border-primary/20 bg-card p-8 text-center shadow-sm">
          {data.hasResumeAnalysis ? (
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-primary" />
          ) : (
            <LockKeyhole className="mx-auto mb-3 h-8 w-8 text-primary" />
          )}
          <h2 className="font-display text-xl font-semibold">
            {data.hasResumeAnalysis ? "No resume gaps found yet" : "Resume analysis required"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {data.message ??
              "Upload and analyze your own resume against a job description first. Then CareerLift AI will build a roadmap from your resume gaps only."}
          </p>
          <Button asChild className="mt-4">
            <Link to="/resume-analyzer">Go to Resume Analyzer</Link>
          </Button>
        </Card>
      )}

      {data?.hasData && (
        <>
          <Card className="p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Detected skill gaps from your resume analyses ({data.keywords.length})
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Built from {data.analysisCount} resume analysis{data.analysisCount === 1 ? "" : "es"} in your account only.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.keywords.map((k) => (
                <span
                  key={k}
                  className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800"
                >
                  {k}
                </span>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {data.items.map((item, i) => (
              <Card key={i} className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold text-foreground">{item.topic}</h3>
                  <Badge className={`border ${priorityStyle[(item.priority as Priority) ?? "medium"]}`}>
                    {item.priority}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{item.why}</p>
                <ul className="space-y-1.5">
                  {item.resources.map((r, ri) => (
                    <li key={ri}>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="group flex items-center gap-2 text-sm text-teal-700 hover:underline"
                      >
                        <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] uppercase text-teal-700">
                          {r.type}
                        </span>
                        <span className="flex-1 truncate">{r.title}</span>
                        <ExternalLink className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
                      </a>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
