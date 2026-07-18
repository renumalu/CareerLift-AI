import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ClipboardList,
  Database,
  FileText,
  Mic,
  Minus,
  RefreshCw,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { getDashboardOverview } from "@/lib/dashboard.functions";
import { getDataCheckCounts } from "@/lib/data-check.functions";
import { ScoreRing } from "@/components/dashboard/ScoreRing";
import {
  clearErrors,
  installGlobalErrorLogging,
  logError,
  subscribeErrors,
  type LoggedError,
} from "@/lib/error-log";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Career Dashboard — CareerLift AI" },
      { name: "description", content: "Track your job search progress: resume score, mock interview performance, application activity, and next best actions — all in one place." },
      { property: "og:title", content: "Career Dashboard — CareerLift AI" },
      { property: "og:description", content: "Your personal job readiness snapshot: resume score, interview performance, and application activity trends." },
      { property: "og:url", content: "https://careerliftaiproj.lovable.app/dashboard" },
    ],
    links: [{ rel: "canonical", href: "https://careerliftaiproj.lovable.app/dashboard" }],
  }),
  component: DashboardHome,
});

function DashboardHome() {
  const [name, setName] = useState<string>("");
  const fetchOverview = useServerFn(getDashboardOverview);
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata as { full_name?: string; name?: string } | undefined;
      setName(meta?.full_name ?? meta?.name ?? data.user?.email?.split("@")[0] ?? "");
    });
  }, []);

  // Realtime: refresh dashboard when the user's data changes on any device.
  useEffect(() => {
    installGlobalErrorLogging();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
        queryClient.invalidateQueries({ queryKey: ["data-check-counts"] });
      };
      channel = supabase
        .channel(`dashboard-${uid}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "job_applications", filter: `user_id=eq.${uid}` }, invalidate)
        .on("postgres_changes", { event: "*", schema: "public", table: "resume_analyses", filter: `user_id=eq.${uid}` }, invalidate)
        .on("postgres_changes", { event: "*", schema: "public", table: "interview_sessions", filter: `user_id=eq.${uid}` }, invalidate)
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            logError("realtime", `Realtime channel status: ${status}`);
          }
        });
    }).catch((err) => logError("manual", "Failed to init realtime channel", err));
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: () => fetchOverview(),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (error) logError("manual", "Dashboard overview failed to load", error);
  }, [error]);

  return (
    <div className="max-w-6xl space-y-6">

      <header>
        <h1 className="font-display text-3xl font-semibold text-foreground">
          Career Dashboard
        </h1>
        <p className="mt-1 text-muted-foreground">
          Welcome back{name ? `, ${name}` : ""} — here's your job readiness snapshot for today.
        </p>
      </header>

      {isLoading || !data ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : (
        <>
          <section aria-labelledby="dashboard-overview-heading">
            <h2 id="dashboard-overview-heading" className="sr-only">Overview</h2>
            <HeroCard data={data} />
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <TrendCard
                label="Resume score"
                value={data.breakdown.resume}
                trend={data.trends.resume}
                icon={<FileText className="h-4 w-4" />}
                accent="primary"
                emptyHint="Run your first analysis"
              />
              <TrendCard
                label="Interview performance"
                value={data.breakdown.interview}
                trend={data.trends.interview}
                icon={<Mic className="h-4 w-4" />}
                accent="secondary"
                emptyHint="Try a mock session"
              />
              <ApplicationsCard
                thisWeek={data.applications.thisWeek}
                delta={data.applications.delta}
              />
            </div>
          </section>

          <section aria-labelledby="dashboard-trends-heading">
            <h2 id="dashboard-trends-heading" className="sr-only">Score trends</h2>
            <TrendsChart data={data.timeseries} />
          </section>


          <section aria-labelledby="dashboard-activity-heading">
            <h2 id="dashboard-activity-heading" className="sr-only">Next action and activity</h2>
            <div className="grid gap-4 lg:grid-cols-5">
              <NextActionCard weakest={data.weakest} hasData={data.hasAnyData} />
              <ActivityFeed items={data.activity} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}


function TrendsChart({ data }: { data: { date: string; resume: number | null; interview: number | null }[] }) {
  if (!data || data.length < 2) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="font-display text-lg font-semibold text-foreground">Score trends over time</h3>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> Resume</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-secondary" /> Interview</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
          <Tooltip
            contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
          />
          <Line type="monotone" dataKey="resume" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="interview" stroke="var(--color-secondary)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}

/* -------------------- Hero -------------------- */
function HeroCard({
  data,
}: {
  data: {
    overall: number;
    summary: string;
    breakdown: { resume: number | null; interview: number | null; applications: number | null };
    hasAnyData: boolean;
  };
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-[oklch(0.18_0.02_260)] p-6 text-white shadow-elevated md:p-8">
      <div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-center">
        <div className="flex justify-center">
          <ScoreRing score={data.overall} size={200} label="Job readiness" />
        </div>
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Your coach says
          </div>
          <p className="mt-3 font-display text-2xl leading-snug text-white md:text-3xl">
            {data.hasAnyData
              ? data.summary
              : "Let's build your baseline — start with a resume analysis or a mock interview and I'll begin tracking your readiness."}
          </p>
          <dl className="mt-6 grid grid-cols-3 gap-4 text-sm">
            <Metric label="Resume" value={data.breakdown.resume} />
            <Metric label="Interview" value={data.breakdown.interview} />
            <Metric label="App health" value={data.breakdown.applications} />
          </dl>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg bg-white/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/60">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold text-white">
        {value === null ? "—" : <>{value}<span className="text-sm text-white/50">/100</span></>}
      </div>
    </div>
  );
}

/* -------------------- Sparkline card -------------------- */
function TrendCard({
  label,
  value,
  trend,
  icon,
  accent,
  emptyHint,
}: {
  label: string;
  value: number | null;
  trend: number[];
  icon: React.ReactNode;
  accent: "primary" | "secondary";
  emptyHint: string;
}) {
  const stroke = accent === "primary" ? "var(--color-primary)" : "var(--color-secondary)";
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="flex items-center gap-2 text-sm">{icon}{label}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div className="font-display text-4xl font-semibold text-foreground">
          {value === null ? "—" : value}
          {value !== null && <span className="ml-1 text-base font-normal text-muted-foreground">/100</span>}
        </div>
        {trend.length > 1 ? (
          <Sparkline values={trend} stroke={stroke} />
        ) : (
          <span className="text-xs text-muted-foreground">{emptyHint}</span>
        )}
      </div>
    </div>
  );
}

function Sparkline({ values, stroke }: { values: number[]; stroke: string }) {
  const w = 100;
  const h = 36;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const step = w / Math.max(1, values.length - 1);
  const points = values.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" points={points} />
      {values.map((v, i) => (
        <circle key={i} cx={i * step} cy={h - ((v - min) / range) * h} r={i === values.length - 1 ? 3 : 1.5} fill={stroke} />
      ))}
    </svg>
  );
}

function ApplicationsCard({ thisWeek, delta }: { thisWeek: number; delta: number }) {
  const Arrow = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const color = delta > 0 ? "text-primary" : delta < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="flex items-center gap-2 text-sm"><ClipboardList className="h-4 w-4" />Applications this week</span>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div className="font-display text-4xl font-semibold text-foreground">{thisWeek}</div>
        <div className={`flex items-center gap-1 text-sm ${color}`}>
          <Arrow className="h-4 w-4" />
          {delta === 0 ? "same as last week" : `${Math.abs(delta)} vs last week`}
        </div>
      </div>
    </div>
  );
}

/* -------------------- Next action -------------------- */
function NextActionCard({
  weakest,
  hasData,
}: {
  weakest: "resume" | "interview" | "applications";
  hasData: boolean;
}) {
  const config = {
    resume: {
      title: "Analyze a new resume",
      body: "Tighten your resume against a target job description to lift your match score.",
      to: "/resume-analyzer",
      icon: <FileText className="h-5 w-5" />,
    },
    interview: {
      title: "Do a mock interview",
      body: "A quick 5-question session keeps your reps sharp and reveals blind spots.",
      to: "/mock-interview",
      icon: <Mic className="h-5 w-5" />,
    },
    applications: {
      title: "Log a new application",
      body: "Momentum matters. Add today's applications to keep your pipeline moving.",
      to: "/application-tracker",
      icon: <ClipboardList className="h-5 w-5" />,
    },
  }[hasData ? weakest : "resume"];

  return (
    <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-soft lg:col-span-2">
      <div className="text-xs uppercase tracking-widest text-primary">Recommended next action</div>
      <h3 className="mt-2 font-display text-2xl font-semibold text-foreground">{config.title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{config.body}</p>
      <Link
        to={config.to}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
      >
        {config.icon}
        Start now
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

/* -------------------- Activity feed -------------------- */
function ActivityFeed({
  items,
}: {
  items: {
    id: string;
    kind: "resume" | "interview" | "application";
    title: string;
    subtitle?: string;
    timestamp: string;
  }[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft lg:col-span-3">
      <h3 className="font-display text-lg font-semibold text-foreground">Recent activity</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No activity yet — your actions across the app will show up here.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-3">
              <ActivityIcon kind={item.kind} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
                {item.subtitle && <div className="truncate text-xs text-muted-foreground">{item.subtitle}</div>}
              </div>
              <time className="shrink-0 text-xs text-muted-foreground">{timeAgo(item.timestamp)}</time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityIcon({ kind }: { kind: "resume" | "interview" | "application" }) {
  const map = {
    resume: { icon: <FileText className="h-4 w-4" />, cls: "bg-primary/15 text-primary" },
    interview: { icon: <Mic className="h-4 w-4" />, cls: "bg-secondary/20 text-secondary-foreground" },
    application: { icon: <ClipboardList className="h-4 w-4" />, cls: "bg-muted text-foreground" },
  }[kind];
  return <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${map.cls}`}>{map.icon}</span>;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

/* -------------------- Data check panel -------------------- */
function DataCheckPanel() {
  const fetchCounts = useServerFn(getDataCheckCounts);
  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["data-check-counts"],
    queryFn: () => fetchCounts(),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (error) logError("manual", "Data check counts failed", error);
  }, [error]);

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h3 className="font-display text-lg font-semibold text-foreground">Data check (realtime)</h3>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Exact row counts from the database for your account.</p>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        <CountTile label="Applications" value={data?.applications} />
        <CountTile label="Resume analyses" value={data?.resumeAnalyses} />
        <CountTile label="Interview sessions" value={data?.interviewSessions} />
      </dl>
      {data && (
        <div className="mt-3 text-right text-[10px] uppercase tracking-wider text-muted-foreground">
          Checked {new Date(data.checkedAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

function CountTile({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
      <div className="font-display text-2xl font-semibold text-foreground">
        {value === undefined ? "—" : value}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

/* -------------------- Error log panel -------------------- */
function ErrorLogPanel() {
  const [items, setItems] = useState<LoggedError[]>([]);
  useEffect(() => subscribeErrors(setItems), []);

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className={`h-4 w-4 ${items.length ? "text-destructive" : "text-muted-foreground"}`} />
          <h3 className="font-display text-lg font-semibold text-foreground">
            Error log <span className="text-sm font-normal text-muted-foreground">({items.length})</span>
          </h3>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clearErrors}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No errors captured. Realtime, page-load, and unhandled promise errors will appear here.
        </p>
      ) : (
        <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {items.map((e) => (
            <li key={e.id} className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-destructive">
                  {e.source}
                </span>
                <time className="text-[10px] text-muted-foreground">{new Date(e.at).toLocaleTimeString()}</time>
              </div>
              <div className="mt-1 font-medium text-foreground">{e.message}</div>
              {e.detail && (
                <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap break-words text-[10px] text-muted-foreground">
                  {e.detail}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
