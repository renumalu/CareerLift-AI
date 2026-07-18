import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ShieldCheck, RefreshCw, Activity, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyAuditLog } from "@/lib/audit.functions";
import { getRecentAlerts, resolveAlert } from "@/lib/alerts.functions";

export const Route = createFileRoute("/_authenticated/security")({
  head: () => ({
    meta: [
      { title: "Security & Audit — CareerLift AI" },
      { name: "description", content: "Audit log of every sign-in, data change, and denied action, plus a monitoring feed for auth, realtime, and API errors." },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://careerliftaiproj.lovable.app/security" }],
  }),
  component: SecurityPage,
});

function severityColor(sev: string) {
  if (sev === "critical") return "bg-red-500/15 text-red-500 border-red-500/30";
  if (sev === "error") return "bg-red-500/10 text-red-500 border-red-500/20";
  if (sev === "warning") return "bg-amber-500/10 text-amber-500 border-amber-500/20";
  return "bg-blue-500/10 text-blue-500 border-blue-500/20";
}

function statusColor(status: string) {
  if (status === "denied") return "bg-red-500/10 text-red-500";
  if (status === "error") return "bg-amber-500/10 text-amber-500";
  return "bg-emerald-500/10 text-emerald-500";
}

function SecurityPage() {
  const queryClient = useQueryClient();
  const fetchAudit = useServerFn(getMyAuditLog);
  const fetchAlerts = useServerFn(getRecentAlerts);
  const resolve = useServerFn(resolveAlert);

  const audit = useQuery({
    queryKey: ["audit-log"],
    queryFn: () => fetchAudit(),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const alerts = useQuery({
    queryKey: ["system-alerts"],
    queryFn: () => fetchAlerts(),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const ch = supabase
      .channel("security-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_log" }, () => {
        queryClient.invalidateQueries({ queryKey: ["audit-log"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "system_alerts" }, () => {
        queryClient.invalidateQueries({ queryKey: ["system-alerts"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [queryClient]);

  const unresolved = (alerts.data ?? []).filter((a) => !a.resolved);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ShieldCheck className="h-6 w-6 text-primary" /> Security & Audit
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live audit trail of your account activity and monitoring alerts for auth, realtime, and API errors.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            audit.refetch();
            alerts.refetch();
          }}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </header>

      <section aria-labelledby="alerts-heading" className="rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 id="alerts-heading" className="flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> Monitoring alerts
            {unresolved.length > 0 && (
              <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-500">
                {unresolved.length} open
              </span>
            )}
          </h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Server-recorded issues from browser errors, realtime drops, auth failures, and API crashes. Errors are throttled to avoid duplicates.
        </p>
        <div className="mt-4 space-y-2">
          {alerts.isLoading && <p className="text-sm text-muted-foreground">Loading alerts…</p>}
          {!alerts.isLoading && (alerts.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              No alerts recorded — your app is healthy.
            </p>
          )}
          {(alerts.data ?? []).map((a) => (
            <div
              key={a.id}
              className={`flex items-start justify-between gap-3 rounded-md border p-3 text-sm ${a.resolved ? "opacity-60" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded border px-2 py-0.5 text-xs font-medium ${severityColor(a.severity)}`}>
                    {a.severity}
                  </span>
                  <span className="rounded bg-muted px-2 py-0.5 text-xs">{a.category}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 break-words">{a.message}</p>
              </div>
              {!a.resolved && (
                <button
                  type="button"
                  onClick={async () => {
                    await resolve({ data: { id: a.id } });
                    queryClient.invalidateQueries({ queryKey: ["system-alerts"] });
                  }}
                  className="shrink-0 rounded-md border px-2 py-1 text-xs hover:bg-accent"
                >
                  Resolve
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="audit-heading" className="rounded-lg border bg-card p-5">
        <h2 id="audit-heading" className="flex items-center gap-2 text-lg font-semibold">
          <Activity className="h-5 w-5 text-primary" /> Audit log
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Every sign-in, data mutation, and permission-denied event with timestamps.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Event</th>
                <th className="py-2 pr-3">Resource</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">IP</th>
              </tr>
            </thead>
            <tbody>
              {audit.isLoading && (
                <tr><td colSpan={5} className="py-3 text-muted-foreground">Loading audit trail…</td></tr>
              )}
              {!audit.isLoading && (audit.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-muted-foreground">
                    No audit entries yet. Sign in or perform an action to record activity.
                  </td>
                </tr>
              )}
              {(audit.data ?? []).map((e) => (
                <tr key={e.id} className="border-t align-top">
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 font-medium">
                    <span className="inline-flex items-center gap-1">
                      <KeyRound className="h-3 w-3 opacity-60" />
                      {e.event_type}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {e.resource_type ?? "—"}
                    {e.resource_id ? ` · ${e.resource_id.slice(0, 8)}` : ""}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${statusColor(e.status)}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{e.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
