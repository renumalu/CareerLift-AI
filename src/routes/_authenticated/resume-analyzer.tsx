import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Sparkles,
  X,
  Check,
  History,
  FileText,
  RefreshCw,
  Upload,
  AlertTriangle,
  FileCheck2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  analyzeResume,
  listResumeAnalyses,
  getResumeAnalysis,
  updateAnalysisState,
} from "@/lib/resume-analyzer.functions";

export const Route = createFileRoute("/_authenticated/resume-analyzer")({
  head: () => ({
    meta: [
      { title: "Resume Analyzer — CareerLift AI" },
      { name: "description", content: "Upload your PDF or DOCX resume and get instant ATS scoring, keyword gap analysis, and actionable content suggestions tailored to any job description." },
      { property: "og:title", content: "Resume Analyzer — CareerLift AI" },
      { property: "og:description", content: "Instant ATS scoring, keyword gap analysis, and content suggestions for your resume." },
      { property: "og:url", content: "https://careerliftaiproj.lovable.app/resume-analyzer" },
    ],
    links: [{ rel: "canonical", href: "https://careerliftaiproj.lovable.app/resume-analyzer" }],
  }),
  component: ResumeAnalyzerPage,
});

type CategoryScores = {
  skills_match: number;
  experience_relevance: number;
  ats_compatibility: number;
  formatting_clarity: number;
};

type Analysis = {
  id: string;
  resume_text: string;
  extracted_resume_text: string;
  resume_file_name: string | null;
  resume_file_url: string | null;
  job_description: string;
  overall_score: number;
  ats_score: number;
  category_scores: CategoryScores;
  missing_keywords: string[];
  ats_fixes: string[];
  suggestions: string[];
  addressed_suggestions: number[];
  addressed_ats_fixes: number[];
  dismissed_keywords: string[];
  created_at: string;
};

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function toNumberArray(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
}

function normalize(row: unknown): Analysis {
  const r = row as Record<string, unknown>;
  const cs = (r.category_scores ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    resume_text: String(r.resume_text ?? ""),
    extracted_resume_text: String(r.extracted_resume_text ?? r.resume_text ?? ""),
    resume_file_name: (r.resume_file_name as string | null) ?? null,
    resume_file_url: (r.resume_file_url as string | null) ?? null,
    job_description: String(r.job_description ?? ""),
    overall_score: Number(r.overall_score ?? 0),
    ats_score: Number(r.ats_score ?? 0),
    category_scores: {
      skills_match: Number(cs.skills_match ?? 0),
      experience_relevance: Number(cs.experience_relevance ?? 0),
      ats_compatibility: Number(cs.ats_compatibility ?? r.ats_score ?? 0),
      formatting_clarity: Number(cs.formatting_clarity ?? 0),
    },
    missing_keywords: toStringArray(r.missing_keywords),
    ats_fixes: toStringArray(r.ats_fixes),
    suggestions: toStringArray(r.suggestions),
    addressed_suggestions: toNumberArray(r.addressed_suggestions),
    addressed_ats_fixes: toNumberArray(r.addressed_ats_fixes),
    dismissed_keywords: toStringArray(r.dismissed_keywords),
    created_at: String(r.created_at),
  };
}

async function extractResumeText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    // Use a bundled worker via URL import (Vite handles this)
    const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerSrc;
    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const out: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items
        .map((it) => ("str" in it ? (it as { str: string }).str : ""))
        .filter(Boolean);
      out.push(strings.join(" "));
    }
    return out.join("\n\n").replace(/\s+\n/g, "\n").trim();
  }
  if (name.endsWith(".docx")) {
    const mammoth = (await import("mammoth/mammoth.browser" as string)) as {
      extractRawText: (opts: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
    };
    const buf = await file.arrayBuffer();
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    return String(res.value ?? "").trim();
  }
  throw new Error("Unsupported file type. Please upload a PDF or DOCX.");
}

function ResumeAnalyzerPage() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [current, setCurrent] = useState<Analysis | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const jdRef = useRef<HTMLTextAreaElement | null>(null);


  const analyzeFn = useServerFn(analyzeResume);
  const listFn = useServerFn(listResumeAnalyses);
  const getFn = useServerFn(getResumeAnalysis);
  const updateFn = useServerFn(updateAnalysisState);

  const historyQ = useQuery({
    queryKey: ["resume-analyses"],
    queryFn: () => listFn(),
  });

  const analyzeM = useMutation({
    mutationFn: (vars: {
      resumeText: string;
      jobDescription: string;
      resumeFileUrl?: string;
      resumeFileName?: string;
    }) => analyzeFn({ data: vars }),
    onSuccess: (row) => {
      const a = normalize(row);
      setCurrent(a);
      qc.invalidateQueries({ queryKey: ["resume-analyses"] });
      toast.success("Analysis complete");
    },
    onError: (err: Error) => toast.error(err.message ?? "Analysis failed"),
  });

  const updateM = useMutation({
    mutationFn: (vars: {
      id: string;
      addressed_suggestions?: number[];
      addressed_ats_fixes?: number[];
      dismissed_keywords?: string[];
    }) => updateFn({ data: vars }),
  });

  const handleFile = useCallback(async (f: File) => {
    const name = f.name.toLowerCase();
    if (!name.endsWith(".pdf") && !name.endsWith(".docx")) {
      toast.error("Please upload a PDF or DOCX file.");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      toast.error("File is too large (max 8MB).");
      return;
    }
    setFile(f);
    setFileUrl(null);
    setExtractedText("");
    setParsing(true);
    try {
      const text = await extractResumeText(f);
      if (text.length < 20) {
        throw new Error("We couldn't extract readable text. Is the PDF scanned as an image?");
      }
      setExtractedText(text);
      toast.success("Resume parsed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to parse resume");
      setFile(null);
    } finally {
      setParsing(false);
    }

    // Upload to storage in the background
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");
      const path = `${uid}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage.from("resumes").upload(path, f, {
        cacheControl: "3600",
        upsert: false,
        contentType: f.type || undefined,
      });
      if (error) throw error;
      setFileUrl(path);
    } catch (e) {
      // Non-fatal — analysis still works from extracted text
      console.warn("Resume upload failed", e);
    } finally {
      setUploading(false);
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const clearFile = () => {
    setFile(null);
    setFileUrl(null);
    setExtractedText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const loadAnalysis = async (id: string) => {
    const row = await getFn({ data: { id } });
    const a = normalize(row);
    setCurrent(a);
    setExtractedText(a.extracted_resume_text);
    setJobDescription(a.job_description);
    if (a.resume_file_name) {
      // Represent the historical file as a pseudo-File for display only
      setFile(new File([], a.resume_file_name));
      setFileUrl(a.resume_file_url);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleAnalyze = () => {
    if (extractedText.trim().length < 20) {
      toast.error("Upload a resume first (or wait for parsing to finish).");
      return;
    }
    if (jobDescription.trim().length < 20) {
      toast.error("Paste the target job description (at least 20 characters).");
      return;
    }
    analyzeM.mutate({
      resumeText: extractedText.trim(),
      jobDescription: jobDescription.trim(),
      resumeFileUrl: fileUrl ?? undefined,
      resumeFileName: file?.name,
    });
  };

  const dismissKeyword = (kw: string) => {
    if (!current) return;
    const next = [...new Set([...current.dismissed_keywords, kw])];
    setCurrent({ ...current, dismissed_keywords: next });
    updateM.mutate({ id: current.id, dismissed_keywords: next });
  };

  const toggleAddressed = (idx: number) => {
    if (!current) return;
    const set = new Set(current.addressed_suggestions);
    if (set.has(idx)) set.delete(idx);
    else set.add(idx);
    const next = [...set];
    setCurrent({ ...current, addressed_suggestions: next });
    updateM.mutate({ id: current.id, addressed_suggestions: next });
  };

  const toggleAtsFix = (idx: number) => {
    if (!current) return;
    const set = new Set(current.addressed_ats_fixes);
    if (set.has(idx)) set.delete(idx);
    else set.add(idx);
    const next = [...set];
    setCurrent({ ...current, addressed_ats_fixes: next });
    updateM.mutate({ id: current.id, addressed_ats_fixes: next });
  };

  const visibleKeywords = useMemo(() => {
    if (!current) return [];
    const dismissed = new Set(current.dismissed_keywords);
    return current.missing_keywords.filter((k) => !dismissed.has(k));
  }, [current]);

  const startNew = () => {
    setCurrent(null);
    clearFile();
    setJobDescription("");
  };

  const reanalyzeNewJD = () => {
    // Keep the uploaded resume + extracted text, clear the JD & prior result
    setCurrent(null);
    setJobDescription("");
    setTimeout(() => {
      jdRef.current?.focus();
      jdRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    toast.info("Resume kept — paste a new job description to re-analyze.");
  };

  // Derive matched keywords by intersecting significant JD tokens with resume text.
  const STOPWORDS = useMemo(
    () =>
      new Set([
        "the","and","for","with","you","your","our","are","will","have","has","from",
        "this","that","into","was","were","been","their","they","them","its","use",
        "used","using","who","what","when","where","why","how","all","any","can",
        "may","must","should","would","could","about","across","within","while",
        "over","per","via","also","not","but","than","then","such","other","new",
        "role","team","work","working","experience","years","year","required",
        "preferred","plus","strong","ability","including","etc","job","description",
      ]),
    [],
  );
  const matchedKeywords = useMemo(() => {
    if (!current) return [] as string[];
    const jdTokens = new Set(
      current.job_description
        .toLowerCase()
        .split(/[^a-z0-9+.#-]+/i)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
    );
    const resumeLc = current.extracted_resume_text.toLowerCase();
    const missingLc = new Set(current.missing_keywords.map((k) => k.toLowerCase()));
    const matched: string[] = [];
    for (const tok of jdTokens) {
      if (missingLc.has(tok)) continue;
      if (resumeLc.includes(tok)) matched.push(tok);
    }
    return matched.slice(0, 80);
  }, [current, STOPWORDS]);


  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Resume Analyzer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload your resume and paste a target job description. CareerLift AI scores your fit,
          checks ATS compatibility, and tells you exactly what to fix.
        </p>
      </header>

      {/* Upload + JD */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <label className="mb-2 block text-sm font-medium">Your resume (PDF or DOCX)</label>

          {!file ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50"
              }`}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">Drag & drop your resume here</span>
              <span className="text-xs text-muted-foreground">
                or click to browse — PDF or DOCX, up to 8MB
              </span>
            </button>
          ) : (
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <FileCheck2 className="h-6 w-6 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {parsing
                      ? "Parsing resume…"
                      : uploading
                        ? "Saving file…"
                        : `${extractedText.length.toLocaleString()} chars extracted`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearFile}
                  aria-label="Remove file"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {parsing && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting text…
                </div>
              )}
              {!parsing && extractedText && (
                <details className="mt-3 rounded-lg border bg-background p-3 text-xs" open={!!current}>
                  <summary className="cursor-pointer text-sm font-medium">
                    Preview extracted text
                    {current && (
                      <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                        · <span className="text-teal-600">matched</span> ·{" "}
                        <span className="text-amber-700">missing / weak</span>
                      </span>
                    )}
                  </summary>
                  {current ? (
                    <HighlightedResume
                      text={extractedText.slice(0, 8000)}
                      matched={matchedKeywords}
                      missing={current.missing_keywords}
                      truncated={extractedText.length > 8000}
                    />
                  ) : (
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {extractedText.slice(0, 4000)}
                      {extractedText.length > 4000 ? "\n…" : ""}
                    </pre>
                  )}
                </details>
              )}

            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </Card>

        <Card className="p-4">
          <label className="mb-2 block text-sm font-medium">Target job description</label>
          <Textarea
            ref={jdRef}
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the job description you're applying to…"
            className="min-h-[280px] resize-y font-mono text-xs leading-relaxed"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {jobDescription.length.toLocaleString()} chars
          </p>
        </Card>

      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          onClick={handleAnalyze}
          disabled={analyzeM.isPending || parsing || !extractedText}
          className="rounded-xl"
        >
          {analyzeM.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" /> Analyze
            </>
          )}
        </Button>
        {(current || file) && (
          <Button variant="ghost" onClick={startNew}>
            <RefreshCw className="mr-2 h-4 w-4" /> New analysis
          </Button>
        )}
        {current && extractedText && (
          <Button variant="outline" onClick={reanalyzeNewJD} className="rounded-xl">
            <Sparkles className="mr-2 h-4 w-4" /> Re-analyze with new JD
          </Button>
        )}
      </div>


      {/* Result */}
      {current && (
        <div className="space-y-6">
          {/* Scores row */}
          <div className="grid gap-4 md:grid-cols-2">
            <ScoreCard
              label="Overall Match"
              score={current.overall_score}
              caption={
                current.overall_score >= 75
                  ? "Strong match — polish the details."
                  : current.overall_score >= 50
                    ? "Decent match — a few targeted edits will help."
                    : "Weak match — significant tailoring recommended."
              }
            />
            <ScoreCard
              label="ATS Compatibility"
              score={current.ats_score}
              caption={
                current.ats_score >= 75
                  ? "ATS-friendly. Should parse cleanly."
                  : current.ats_score >= 50
                    ? "Some formatting risks — apply the fixes below."
                    : "High risk of being filtered by ATS. Fix formatting first."
              }
            />
          </div>

          {/* Category breakdown */}
          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold">Category breakdown</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <CategoryBar label="Skills Match" score={current.category_scores.skills_match} />
              <CategoryBar
                label="Experience Relevance"
                score={current.category_scores.experience_relevance}
              />
              <CategoryBar
                label="ATS Compatibility"
                score={current.category_scores.ats_compatibility}
              />
              <CategoryBar
                label="Formatting & Clarity"
                score={current.category_scores.formatting_clarity}
              />
            </div>
          </Card>

          {/* ATS-Specific Fixes — highlighted */}
          <Card className="border-amber-300 bg-amber-50/60 p-6 dark:border-amber-900/50 dark:bg-amber-950/20">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <h2 className="font-display text-lg font-semibold text-amber-900 dark:text-amber-200">
                ATS-Specific Fixes
              </h2>
              <Badge
                variant="outline"
                className="ml-auto border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
              >
                Most actionable
              </Badge>
            </div>
            {current.ats_fixes.length === 0 ? (
              <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
                No ATS blockers detected — your formatting looks parser-friendly.
              </p>
            ) : (
              <ol className="space-y-2.5">
                {current.ats_fixes.map((fix, i) => {
                  const done = current.addressed_ats_fixes.includes(i);
                  return (
                    <li key={i} className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => toggleAtsFix(i)}
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
                          done
                            ? "border-amber-600 bg-amber-600 text-white"
                            : "border-amber-400 bg-white text-amber-700 hover:border-amber-600 dark:bg-amber-950/30"
                        }`}
                        aria-label={done ? "Mark as unaddressed" : "Mark as addressed"}
                      >
                        {done ? <Check className="h-4 w-4" /> : <span className="text-xs">{i + 1}</span>}
                      </button>
                      <p
                        className={`text-sm leading-relaxed ${
                          done
                            ? "text-amber-900/60 line-through dark:text-amber-200/60"
                            : "text-amber-950 dark:text-amber-100"
                        }`}
                      >
                        {fix}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          {/* Missing keywords */}
          <Card className="p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Missing keywords</h2>
              <span className="text-xs text-muted-foreground">
                Present in the JD — weak or missing in your resume. Click to dismiss.
              </span>
            </div>
            {visibleKeywords.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No missing keywords remaining. Nice work.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {visibleKeywords.map((kw) => (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => dismissKeyword(kw)}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-secondary/40 bg-secondary/15 px-3 py-1 text-sm font-medium text-foreground transition-colors hover:bg-secondary/25"
                  >
                    {kw}
                    <X className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Content suggestions */}
          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold">Content Suggestions</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Tap the number to mark a suggestion as addressed.
            </p>
            <ol className="mt-4 space-y-3">
              {current.suggestions.map((s, i) => {
                const done = current.addressed_suggestions.includes(i);
                return (
                  <li key={i} className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleAddressed(i)}
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        done
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:border-primary"
                      }`}
                      aria-label={done ? "Mark as unaddressed" : "Mark as addressed"}
                    >
                      {done ? <Check className="h-4 w-4" /> : <span className="text-xs">{i + 1}</span>}
                    </button>
                    <p
                      className={`text-sm leading-relaxed ${
                        done ? "text-muted-foreground line-through" : ""
                      }`}
                    >
                      {s}
                    </p>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      )}

      {/* History */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-display text-lg font-semibold">Past analyses</h2>
        </div>
        {historyQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (historyQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No analyses yet. Run one above.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {(historyQ.data ?? []).map((row) => (
              <HistoryItem
                key={row.id}
                row={row as unknown as HistoryRow}
                active={current?.id === row.id}
                onOpen={() => loadAnalysis(row.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

type HistoryRow = {
  id: string;
  overall_score: number;
  ats_score: number | null;
  created_at: string;
  job_description: string;
  resume_file_name: string | null;
};

function scoreColor(score: number) {
  if (score < 50) return { ring: "text-red-500", chip: "text-red-600" };
  if (score < 75) return { ring: "text-amber-500", chip: "text-amber-600" };
  return { ring: "text-teal-500", chip: "text-teal-600" };
}

function CircularScore({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const { ring } = scoreColor(clamped);
  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} className="fill-none stroke-muted" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          strokeWidth="10"
          strokeLinecap="round"
          className={`fill-none transition-[stroke-dashoffset] duration-700 ${ring}`}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          stroke="currentColor"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-display text-3xl font-bold ${scoreColor(clamped).chip}`}>
          {clamped}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function ScoreCard({
  label,
  score,
  caption,
}: {
  label: string;
  score: number;
  caption: string;
}) {
  return (
    <Card className="flex items-center gap-6 p-6">
      <CircularScore score={score} />
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-lg font-semibold">{label}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{caption}</p>
      </div>
    </Card>
  );
}

function HistoryItem({
  row,
  active,
  onOpen,
}: {
  row: HistoryRow;
  active: boolean;
  onOpen: () => void;
}) {
  const { chip } = scoreColor(row.overall_score);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group flex items-start gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-accent ${
        active ? "border-primary ring-1 ring-primary" : "border-border"
      }`}
    >
      <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`font-display text-2xl font-bold ${chip}`}>{row.overall_score}</span>
          <Badge variant="outline" className="text-[10px]">
            {new Date(row.created_at).toLocaleDateString()}
          </Badge>
        </div>
        {row.ats_score !== null && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            ATS {row.ats_score}/100
          </p>
        )}
        {row.resume_file_name && (
          <p className="mt-0.5 truncate text-[11px] font-medium text-foreground/80">
            {row.resume_file_name}
          </p>
        )}
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {row.job_description.slice(0, 140)}
          {row.job_description.length > 140 ? "…" : ""}
        </p>
      </div>
    </button>
  );
}

function CategoryBar({ label, score }: { label: string; score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const color =
    clamped < 50 ? "bg-red-500" : clamped < 75 ? "bg-amber-500" : "bg-teal-500";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{clamped}/100</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedResume({
  text,
  matched,
  missing,
  truncated,
}: {
  text: string;
  matched: string[];
  missing: string[];
  truncated: boolean;
}) {
  const segments = useMemo(() => {
    type Seg = { text: string; kind: "plain" | "matched" | "missing" };
    const terms: { term: string; kind: "matched" | "missing" }[] = [];
    const seen = new Set<string>();
    // Longer terms first so multi-word phrases win over their tokens.
    const push = (term: string, kind: "matched" | "missing") => {
      const t = term.trim();
      if (t.length < 2) return;
      const key = t.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      terms.push({ term: t, kind });
    };
    [...missing].sort((a, b) => b.length - a.length).forEach((t) => push(t, "missing"));
    [...matched].sort((a, b) => b.length - a.length).forEach((t) => push(t, "matched"));
    if (terms.length === 0) return [{ text, kind: "plain" } as Seg];
    const pattern = new RegExp(
      `(${terms.map((t) => escapeRegExp(t.term)).join("|")})`,
      "gi",
    );
    const kindByLc = new Map(terms.map((t) => [t.term.toLowerCase(), t.kind]));
    const out: Seg[] = [];
    let last = 0;
    for (const m of text.matchAll(pattern)) {
      const idx = m.index ?? 0;
      if (idx > last) out.push({ text: text.slice(last, idx), kind: "plain" });
      const kind = kindByLc.get(m[0].toLowerCase()) ?? "matched";
      out.push({ text: m[0], kind });
      last = idx + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last), kind: "plain" });
    return out;
  }, [text, matched, missing]);

  return (
    <div className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
      {segments.map((s, i) =>
        s.kind === "matched" ? (
          <mark
            key={i}
            className="rounded-sm bg-teal-500/20 px-0.5 text-teal-700 dark:text-teal-300"
          >
            {s.text}
          </mark>
        ) : s.kind === "missing" ? (
          <mark
            key={i}
            className="rounded-sm bg-amber-400/30 px-0.5 text-amber-800 underline decoration-amber-600/60 decoration-dotted dark:text-amber-200"
          >
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
      {truncated && <span className="text-muted-foreground">{"\n…"}</span>}
    </div>
  );
}

