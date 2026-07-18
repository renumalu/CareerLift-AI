import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  startInterviewSession,
  submitAnswer,
  listInterviewSessions,
  getInterviewSession,
  resetRoleHistory,
  resetAllHistory,
} from "@/lib/interview.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Send, Sparkles, Trophy, TrendingDown, CheckCircle2, XCircle, History, RotateCcw, Download } from "lucide-react";

type Difficulty = "easy" | "medium" | "hard";

type CategoryScores = {
  communication: number;
  technical_depth: number;
  clarity: number;
  structure: number;
};

type AnswerRow = {
  id: string;
  session_id: string;
  question_index: number;
  question: string;
  question_type: string;
  answer: string | null;
  score: number | null;
  feedback: { strengths?: string[]; missing?: string[]; categories?: CategoryScores | null } | null;
  star_analysis: {
    applicable?: boolean;
    situation?: boolean;
    task?: boolean;
    action?: boolean;
    result?: boolean;
    notes?: string;
  } | null;
};

type SessionRow = {
  id: string;
  role: string;
  difficulty: Difficulty;
  completed: boolean;
  summary: Summary | null;
  strict_no_repeat?: boolean;
  created_at: string;
};

type Summary = {
  average_score: number;
  strongest: { question: string; score: number } | null;
  weakest: { question: string; score: number } | null;
  category_averages?: CategoryScores;
  tips: string[];
};

const TOTAL = 5;

export const Route = createFileRoute("/_authenticated/mock-interview")({
  head: () => ({
    meta: [
      { title: "Mock Interview Coach — CareerLift AI" },
      { name: "description", content: "Practice real-world interview questions asked at Meta, Google, and other top companies, with AI feedback on communication, clarity, and technical depth." },
      { property: "og:title", content: "Mock Interview Coach — CareerLift AI" },
      { property: "og:description", content: "AI-powered mock interviews with performance breakdown by role and difficulty." },
      { property: "og:url", content: "https://careerliftaiproj.lovable.app/mock-interview" },
    ],
    links: [{ rel: "canonical", href: "https://careerliftaiproj.lovable.app/mock-interview" }],
  }),
  component: MockInterviewPage,
});

function scoreColor(score: number) {
  if (score >= 8) return "bg-teal-500 text-white";
  if (score >= 5) return "bg-amber-400 text-slate-900";
  return "bg-red-500 text-white";
}

function MockInterviewPage() {
  const startFn = useServerFn(startInterviewSession);
  const submitFn = useServerFn(submitAnswer);
  const listFn = useServerFn(listInterviewSessions);
  const getFn = useServerFn(getInterviewSession);
  const resetFn = useServerFn(resetRoleHistory);
  const resetAllFn = useServerFn(resetAllHistory);

  const [role, setRole] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [strictNoRepeat, setStrictNoRepeat] = useState(false);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [current, setCurrent] = useState<AnswerRow | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [history, setHistory] = useState<SessionRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogConfig, setDialogConfig] = useState<{
    title: string;
    description: string;
    onConfirm: () => void;
    destructive?: boolean;
  }>({ title: "", description: "", onConfirm: () => {} });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listFn().then((h) => setHistory(h as SessionRow[])).catch(() => {});
  }, [listFn]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [answers, current, summary]);

  async function handleStart() {
    if (role.trim().length < 2) {
      toast.error("Enter a target role");
      return;
    }
    setBusy(true);
    try {
      const res = await startFn({ data: { role: role.trim(), difficulty, strictNoRepeat } });
      setSession(res.session as SessionRow);
      setAnswers([]);
      setCurrent(res.currentQuestion as AnswerRow);
      setSummary(null);
      setAnswerText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    if (!session || !current || !answerText.trim()) return;
    setBusy(true);
    try {
      const res = await submitFn({
        data: { sessionId: session.id, answerId: current.id, answer: answerText.trim() },
      });
      const completed: AnswerRow = {
        ...current,
        answer: answerText.trim(),
        score: res.feedback.score,
        feedback: {
          strengths: res.feedback.strengths,
          missing: res.feedback.missing,
          categories: (res.feedback as { categories?: CategoryScores | null }).categories ?? null,
        },
        star_analysis: res.feedback.star_analysis,
      };
      setAnswers((prev) => [...prev, completed]);
      setAnswerText("");
      if (res.done) {
        setCurrent(null);
        setSummary(res.summary as Summary);
        const h = await listFn();
        setHistory(h as SessionRow[]);
        import("@/lib/confetti").then((m) => m.celebrateOnce("first-interview"));
      } else {
        setCurrent(res.nextQuestion as AnswerRow);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory(id: string) {
    setBusy(true);
    try {
      const res = await getFn({ data: { id } });
      const s = res.session as SessionRow;
      const a = res.answers as AnswerRow[];
      setSession(s);
      setRole(s.role);
      setDifficulty(s.difficulty);
      setStrictNoRepeat(Boolean(s.strict_no_repeat));
      setAnswers(a.filter((x) => x.answer));
      const pending = a.find((x) => !x.answer);
      setCurrent(pending ?? null);
      setSummary(s.summary ?? null);
      setAnswerText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setBusy(false);
    }
  }

  function newSession() {
    setSession(null);
    setAnswers([]);
    setCurrent(null);
    setSummary(null);
    setAnswerText("");
  }

  function confirmAction(config: { title: string; description: string; onConfirm: () => void; destructive?: boolean }) {
    setDialogConfig(config);
    setDialogOpen(true);
  }

  async function handleReset() {
    const target = role.trim();
    if (target.length < 2) {
      toast.error("Enter the role to reset");
      return;
    }
    confirmAction({
      title: "CareerLift AI",
      description: `Reset all past questions for "${target}"? This deletes previous sessions for that role and cannot be undone.`,
      destructive: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          const res = await resetFn({ data: { role: target } });
          const h = await listFn();
          setHistory(h as SessionRow[]);
          const q = res.deletedQuestions;
          const s = res.deletedSessions;
          toast.success(
            q > 0
              ? `Cleared ${q} past question${q === 1 ? "" : "s"} across ${s} session${s === 1 ? "" : "s"} for "${target}"`
              : `No past questions found for "${target}"`,
          );
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Failed to reset");
        } finally {
          setBusy(false);
        }
      },
    });
  }

  async function handleResetAll() {
    confirmAction({
      title: "CareerLift AI",
      description: "Reset question history for ALL roles? This deletes every previous interview session and cannot be undone.",
      destructive: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          const res = await resetAllFn();
          setHistory([]);
          toast.success(
            res.deletedQuestions > 0
              ? `Cleared ${res.deletedQuestions} past question${res.deletedQuestions === 1 ? "" : "s"} across ${res.deletedSessions} session${res.deletedSessions === 1 ? "" : "s"}`
              : "No past questions to clear",
          );
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Failed to reset");
        } finally {
          setBusy(false);
        }
      },
    });
  }

  function handleExit() {
    confirmAction({
      title: "CareerLift AI",
      description: "Exit this mock interview? Your progress so far is saved in Past sessions, but the current unanswered question will be discarded.",
      destructive: true,
      onConfirm: () => {
        newSession();
        listFn().then((h) => setHistory(h as SessionRow[])).catch(() => {});
        toast.success("Interview exited");
      },
    });
  }

  async function handleExportPDF() {
    if (!session) return;
    setBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 48;
      const maxW = pageW - margin * 2;
      let y = margin;

      const writeLine = (text: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number } = {}) => {
        const { size = 11, bold = false, color = [30, 41, 59], gap = 4 } = opts;
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(size);
        doc.setTextColor(color[0], color[1], color[2]);
        const lines = doc.splitTextToSize(text, maxW) as string[];
        for (const ln of lines) {
          if (y > pageH - margin) { doc.addPage(); y = margin; }
          doc.text(ln, margin, y);
          y += size + gap;
        }
      };

      writeLine("CareerLift AI — Mock Interview Report", { size: 18, bold: true, color: [15, 118, 110], gap: 8 });
      writeLine(`Role: ${session.role}`, { size: 11, bold: true });
      writeLine(`Difficulty: ${session.difficulty}   •   Date: ${new Date(session.created_at).toLocaleString()}`, { size: 10, color: [100, 116, 139], gap: 12 });

      if (summary) {
        writeLine("Summary", { size: 14, bold: true, color: [15, 118, 110], gap: 6 });
        writeLine(`Average score: ${summary.average_score.toFixed(1)} / 10`, { bold: true });
        if (summary.strongest) writeLine(`Strongest answer (${summary.strongest.score}/10): ${summary.strongest.question}`);
        if (summary.weakest) writeLine(`Needs work (${summary.weakest.score}/10): ${summary.weakest.question}`);
        if (summary.tips?.length) {
          writeLine("Overall tips:", { bold: true, gap: 2 });
          summary.tips.forEach((t, i) => writeLine(`${i + 1}. ${t}`));
        }
        y += 8;
      }

      writeLine("Transcript", { size: 14, bold: true, color: [15, 118, 110], gap: 6 });
      answers.forEach((a, i) => {
        writeLine(`Q${i + 1} [${a.question_type}] — ${a.question}`, { bold: true, gap: 4 });
        writeLine(`Your answer: ${a.answer ?? ""}`, { gap: 4 });
        if (a.score !== null) writeLine(`Score: ${a.score}/10`, { color: [15, 118, 110] });
        if (a.feedback?.strengths?.length) writeLine(`Strengths: ${a.feedback.strengths.join("; ")}`);
        if (a.feedback?.missing?.length) writeLine(`Missing: ${a.feedback.missing.join("; ")}`);
        y += 6;
      });

      const safeRole = session.role.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      doc.save(`careerlift-interview-${safeRole}-${new Date(session.created_at).toISOString().slice(0, 10)}.pdf`);
      toast.success("Transcript exported");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to export");
    } finally {
      setBusy(false);
    }
  }

  const progress = session ? Math.min(answers.length + (current ? 1 : 0), TOTAL) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Mock Interview Coach</h1>
        <p className="mt-1 text-muted-foreground">
          Practice with AI. Get instant, structured feedback on every answer.
        </p>
      </header>

      {!session && (
        <Card className="rounded-xl border-border p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
            <div>
              <label className="text-sm font-medium">Target role</label>
              <Input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Senior Frontend Engineer"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Difficulty</label>
              <div className="mt-1 flex gap-1 rounded-md border border-border bg-card p-1">
                {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={`rounded px-3 py-1.5 text-sm capitalize transition ${
                      difficulty === d ? "bg-teal-500 text-white" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleStart} disabled={busy} className="bg-teal-500 hover:bg-teal-600">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Start Interview
              </Button>
            </div>
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted p-3">
            <input
              type="checkbox"
              checked={strictNoRepeat}
              onChange={(e) => setStrictNoRepeat(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-teal-500"
            />
            <span className="text-sm">
              <span className="font-medium">Strict no-repeat mode</span>
              <span className="ml-1 text-muted-foreground">
                — never ask any question you've seen before for this exact role and difficulty.
              </span>
            </span>
          </label>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              Want a clean slate? Clear question history so past questions can be asked again.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={busy || role.trim().length < 2}
              >
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Reset history for this role
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetAll}
                disabled={busy}
                className="text-red-600 hover:text-red-700"
              >
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Reset all question history
              </Button>
            </div>
          </div>
        </Card>
      )}

      {session && (
        <Card className="overflow-hidden rounded-xl border-border shadow-sm">
          <div className="flex items-center justify-between border-b bg-muted px-5 py-3">
            <div className="text-sm">
              <span className="font-medium">{session.role}</span>
              <span className="mx-2 text-muted-foreground">•</span>
              <span className="capitalize text-muted-foreground">{session.difficulty}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                Question {Math.min(progress, TOTAL)} of {TOTAL}
              </span>
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-teal-500 transition-all"
                  style={{ width: `${(progress / TOTAL) * 100}%` }}
                />
              </div>
              <Button variant="ghost" size="sm" onClick={newSession}>
                New
              </Button>
              {!summary && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExit}
                  className="text-red-600 hover:text-red-700"
                >
                  <XCircle className="mr-1.5 h-3.5 w-3.5" />
                  Exit interview
                </Button>
              )}
            </div>
          </div>

          <div ref={scrollRef} className="max-h-[560px] space-y-4 overflow-y-auto bg-card p-5">
            {answers.map((a) => (
              <div key={a.id} className="space-y-3">
                <AIBubble questionIndex={a.question_index + 1} type={a.question_type}>
                  {a.question}
                </AIBubble>
                <UserBubble>{a.answer ?? ""}</UserBubble>
                {a.feedback && a.score !== null && (
                  <FeedbackCard
                    score={a.score}
                    feedback={a.feedback}
                    star={a.star_analysis}
                  />
                )}
              </div>
            ))}

            {current && (
              <AIBubble questionIndex={current.question_index + 1} type={current.question_type}>
                {current.question}
              </AIBubble>
            )}

            {summary && <SummaryCard summary={summary} />}
          </div>

          {current && !summary && (
            <div className="border-t bg-muted p-4">
              <Textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Type your answer here..."
                rows={4}
                className="resize-none bg-card"
                disabled={busy}
              />
              <div className="mt-2 flex justify-end">
                <Button
                  onClick={handleSubmit}
                  disabled={busy || !answerText.trim()}
                  className="bg-teal-500 hover:bg-teal-600"
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Submit answer
                </Button>
              </div>
            </div>
          )}

          {summary && (
            <div className="flex flex-wrap justify-end gap-2 border-t bg-muted px-4 py-3">
              <Button
                variant="outline"
                onClick={async () => {
                  const r = session.role;
                  const d = session.difficulty;
                  newSession();
                  setRole(r);
                  setDifficulty(d);
                  setBusy(true);
                  try {
                    const res = await startFn({ data: { role: r, difficulty: d, strictNoRepeat: Boolean(session.strict_no_repeat) || strictNoRepeat } });
                    setSession(res.session as SessionRow);
                    setCurrent(res.currentQuestion as AnswerRow);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed to start");
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Fresh attempt (same role & difficulty)
              </Button>
              <Button variant="outline" onClick={handleExportPDF} disabled={busy}>
                <Download className="mr-2 h-4 w-4" />
                Export as PDF
              </Button>
              <Button onClick={newSession} className="bg-teal-500 hover:bg-teal-600">
                Start a new session
              </Button>
            </div>
          )}
        </Card>
      )}

      {history.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold">
            <History className="h-5 w-5 text-teal-500" /> Past sessions
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {history.map((s) => (
              <button
                key={s.id}
                onClick={() => loadHistory(s.id)}
                className="rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-teal-400 hover:shadow"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.role}</span>
                  {s.summary && (
                    <Badge className={scoreColor(Math.round(s.summary.average_score))}>
                      {s.summary.average_score.toFixed(1)}/10
                    </Badge>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  <span className="capitalize">{s.difficulty}</span>
                  <span className="mx-1">•</span>
                  {new Date(s.created_at).toLocaleDateString()}
                  <span className="mx-1">•</span>
                  {s.completed ? "Completed" : "In progress"}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent className="rounded-xl border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl">{dialogConfig.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {dialogConfig.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant={dialogConfig.destructive ? "destructive" : "default"}
                className={dialogConfig.destructive ? "" : "bg-teal-500 hover:bg-teal-600"}
                onClick={() => {
                  setDialogOpen(false);
                  dialogConfig.onConfirm();
                }}
              >
                Continue
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AIBubble({
  children,
  questionIndex,
  type,
}: {
  children: React.ReactNode;
  questionIndex: number;
  type: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-teal-400">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3">
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Question {questionIndex}</span>
          <Badge variant="outline" className="capitalize">
            {type}
          </Badge>
        </div>
        <p className="text-sm text-foreground">{children}</p>
      </div>
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-teal-500 px-4 py-3 text-sm text-white">
        {children}
      </div>
    </div>
  );
}

function FeedbackCard({
  score,
  feedback,
  star,
}: {
  score: number;
  feedback: { strengths?: string[]; missing?: string[]; categories?: CategoryScores | null };
  star: AnswerRow["star_analysis"];
}) {
  const cats = feedback.categories;
  return (
    <div className="ml-12 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Coach feedback
        </span>
        <Badge className={scoreColor(score)}>{score}/10</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {feedback.strengths && feedback.strengths.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-teal-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Strengths
            </div>
            <ul className="space-y-1 text-sm text-foreground">
              {feedback.strengths.map((s, i) => (
                <li key={i}>• {s}</li>
              ))}
            </ul>
          </div>
        )}
        {feedback.missing && feedback.missing.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-700">
              <XCircle className="h-3.5 w-3.5" /> To improve
            </div>
            <ul className="space-y-1 text-sm text-foreground">
              {feedback.missing.map((s, i) => (
                <li key={i}>• {s}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {cats && (
        <div className="mt-3 border-t pt-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Category breakdown</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ["communication", "Communication"],
                ["technical_depth", "Technical depth"],
                ["clarity", "Clarity"],
                ["structure", "Structure"],
              ] as const
            ).map(([key, label]) => {
              const v = cats[key] ?? 0;
              return (
                <div key={key}>
                  <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
                    <span>{label}</span>
                    <span className="font-semibold text-foreground">{v}/10</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${v >= 8 ? "bg-teal-500" : v >= 5 ? "bg-amber-400" : "bg-red-400"}`}
                      style={{ width: `${(v / 10) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {star?.applicable && (
        <div className="mt-3 border-t pt-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">STAR method check</div>
          <div className="flex flex-wrap gap-2">
            {(["situation", "task", "action", "result"] as const).map((k) => {
              const ok = Boolean(star[k]);
              return (
                <span
                  key={k}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs capitalize ${
                    ok ? "bg-teal-50 text-teal-700" : "bg-red-50 text-red-700"
                  }`}
                >
                  {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  {k}
                </span>
              );
            })}
          </div>
          {star.notes && <p className="mt-2 text-xs text-muted-foreground">{star.notes}</p>}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ summary }: { summary: Summary }) {
  const avg = Math.round(summary.average_score);
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-lg">
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-teal-300">Session report</div>
            <h3 className="mt-1 font-display text-2xl font-semibold">Nice work!</h3>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-teal-400">
              {summary.average_score.toFixed(1)}
              <span className="text-lg text-slate-400">/10</span>
            </div>
            <div className="text-xs text-slate-400">Average score</div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {summary.strongest && (
            <div className="rounded-xl bg-white/5 p-4">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-teal-300">
                <Trophy className="h-3.5 w-3.5" /> Strongest answer
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{summary.strongest.question}</p>
              <div className="mt-2">
                <Badge className={scoreColor(summary.strongest.score)}>
                  {summary.strongest.score}/10
                </Badge>
              </div>
            </div>
          )}
          {summary.weakest && (
            <div className="rounded-xl bg-white/5 p-4">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-300">
                <TrendingDown className="h-3.5 w-3.5" /> Weakest answer
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{summary.weakest.question}</p>
              <div className="mt-2">
                <Badge className={scoreColor(summary.weakest.score)}>
                  {summary.weakest.score}/10
                </Badge>
              </div>
            </div>
          )}
        </div>

        {summary.category_averages && (
          <div className="mt-5 rounded-xl bg-white/5 p-4">
            <div className="mb-3 text-xs font-medium uppercase tracking-wider text-teal-300">
              Performance breakdown
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["communication", "Communication"],
                  ["technical_depth", "Technical depth"],
                  ["clarity", "Clarity"],
                  ["structure", "Structure"],
                ] as const
              ).map(([key, label]) => {
                const v = summary.category_averages![key] ?? 0;
                return (
                  <div key={key}>
                    <div className="flex items-baseline justify-between text-xs text-slate-300">
                      <span>{label}</span>
                      <span className="font-semibold text-white">{v.toFixed(1)}/10</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-950/60">
                      <div
                        className={`h-full ${v >= 8 ? "bg-teal-400" : v >= 5 ? "bg-amber-400" : "bg-red-500"}`}
                        style={{ width: `${(v / 10) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}


        {summary.tips.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-teal-300">
              Improvement tips
            </div>
            <ol className="space-y-2 text-sm text-slate-200">
              {summary.tips.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-semibold text-teal-400">{i + 1}.</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      {/* avg indicator bar */}
      <div className="h-1.5 w-full bg-slate-950/50">
        <div
          className={`h-full transition-all ${
            avg >= 8 ? "bg-teal-400" : avg >= 5 ? "bg-amber-400" : "bg-red-500"
          }`}
          style={{ width: `${(summary.average_score / 10) * 100}%` }}
        />
      </div>
    </div>
  );
}
