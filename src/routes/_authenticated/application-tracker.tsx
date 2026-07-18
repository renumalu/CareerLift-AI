import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  DragOverlay,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { Plus, Inbox, ExternalLink, Trash2, GripVertical, Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  listApplications,
  createApplication,
  updateApplication,
  deleteApplication,
} from "@/lib/applications.functions";

type Status = "applied" | "interview" | "offer" | "rejected";

type Application = {
  id: string;
  company: string;
  role: string;
  status: Status;
  applied_date: string;
  job_link: string | null;
  notes: string | null;
  created_at: string;
};

const COLUMNS: { id: Status; label: string; accent: string; dot: string }[] = [
  { id: "applied", label: "Applied", accent: "border-slate-300 bg-slate-50", dot: "bg-slate-400" },
  { id: "interview", label: "Interview", accent: "border-amber-300 bg-amber-50", dot: "bg-amber-400" },
  { id: "offer", label: "Offer", accent: "border-teal-300 bg-teal-50", dot: "bg-teal-500" },
  { id: "rejected", label: "Rejected", accent: "border-rose-300 bg-rose-50", dot: "bg-rose-400" },
];

export const Route = createFileRoute("/_authenticated/application-tracker")({
  head: () => ({
    meta: [
      { title: "Application Tracker — CareerLift AI" },
      { name: "description", content: "Track every job application in one place: statuses, deadlines, follow-ups, and CSV export for your entire pipeline." },
      { property: "og:title", content: "Application Tracker — CareerLift AI" },
      { property: "og:description", content: "Manage your full job application pipeline: statuses, follow-ups, and CSV export." },
      { property: "og:url", content: "https://careerliftaiproj.lovable.app/application-tracker" },
    ],
    links: [{ rel: "canonical", href: "https://careerliftaiproj.lovable.app/application-tracker" }],
  }),
  component: ApplicationTrackerPage,
});

function ApplicationTrackerPage() {
  const qc = useQueryClient();
  const list = useServerFn(listApplications);
  const create = useServerFn(createApplication);
  const update = useServerFn(updateApplication);
  const remove = useServerFn(deleteApplication);

  const query = useQuery({
    queryKey: ["applications"],
    queryFn: () => list(),
  });

  const apps = (query.data ?? []) as Application[];

  const stats = useMemo(() => {
    const total = apps.length;
    const interview = apps.filter((a) => a.status === "interview" || a.status === "offer").length;
    const offer = apps.filter((a) => a.status === "offer").length;
    const interviewRate = total ? Math.round((interview / total) * 100) : 0;
    const offerRate = total ? Math.round((offer / total) * 100) : 0;
    return { total, interviewRate, offerRate };
  }, [apps]);

  const grouped = useMemo(() => {
    const g: Record<Status, Application[]> = { applied: [], interview: [], offer: [], rejected: [] };
    for (const a of apps) g[a.status].push(a);
    return g;
  }, [apps]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);

  const updateMut = useMutation({
    mutationFn: (input: {
      id: string;
      company?: string;
      role?: string;
      status?: Status;
      applied_date?: string;
      job_link?: string | null;
      notes?: string | null;
    }) => update({ data: input }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["applications"] });
      const prev = qc.getQueryData<Application[]>(["applications"]);
      if (prev && input) {
        qc.setQueryData<Application[]>(
          ["applications"],
          prev.map((a) => (a.id === input.id ? ({ ...a, ...input } as Application) : a)),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["applications"], ctx.prev);
      toast.error("Failed to update application");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["applications"] }),
  });

  const createMut = useMutation({
    mutationFn: (input: {
      company: string;
      role: string;
      status: Status;
      applied_date: string;
      job_link?: string;
      notes?: string;
    }) => create({ data: input }),
    onSuccess: () => {
      toast.success("Application added");
      if (apps.length === 0) {
        import("@/lib/confetti").then((m) => m.celebrateOnce("first-application"));
      }
      qc.invalidateQueries({ queryKey: ["applications"] });
      setOpenCreate(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Application removed");
      qc.invalidateQueries({ queryKey: ["applications"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const overId = e.over?.id ? String(e.over.id) : null;
    const activeAppId = String(e.active.id);
    if (!overId) return;
    const app = apps.find((a) => a.id === activeAppId);
    if (!app) return;
    // over could be a column id or another card id
    const targetStatus = (COLUMNS.find((c) => c.id === overId)?.id ??
      apps.find((a) => a.id === overId)?.status) as Status | undefined;
    if (!targetStatus || targetStatus === app.status) return;
    updateMut.mutate({ id: app.id, status: targetStatus });
  }

  const activeApp = activeId ? apps.find((a) => a.id === activeId) ?? null : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Application Tracker</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track every job application from applied to offer.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => exportApplicationsCSV(apps)}
            disabled={apps.length === 0}
            className="gap-2"
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> Add Application
              </Button>
            </DialogTrigger>
            <ApplicationDialog
              title="Add Application"
              submitting={createMut.isPending}
              onSubmit={(v) => createMut.mutate(v)}
            />
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total Applications" value={stats.total.toString()} />
        <StatCard label="Interview Rate" value={`${stats.interviewRate}%`} accent="text-amber-600" />
        <StatCard label="Offer Rate" value={`${stats.offerRate}%`} accent="text-teal-600" />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => (
            <Column key={col.id} column={col} items={grouped[col.id]} onCardClick={setEditing} />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 200 }}>
          {activeApp ? <ApplicationCard app={activeApp} dragging /> : null}
        </DragOverlay>
      </DndContext>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <ApplicationDialog
            title="Edit Application"
            initial={editing}
            submitting={updateMut.isPending}
            onSubmit={(v) => {
              updateMut.mutate({ id: editing.id, ...v });
              setEditing(null);
            }}
            onDelete={() => deleteMut.mutate(editing.id)}
          />
        )}
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card className="rounded-xl p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-display text-2xl font-semibold", accent)}>{value}</div>
    </Card>
  );
}

function Column({
  column,
  items,
  onCardClick,
}: {
  column: (typeof COLUMNS)[number];
  items: Application[];
  onCardClick: (a: Application) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[420px] flex-col rounded-xl border p-3 transition-colors",
        column.accent,
        isOver && "ring-2 ring-primary/40",
      )}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", column.dot)} />
          <h3 className="font-display text-sm font-semibold">{column.label}</h3>
        </div>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {items.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/50 p-6 text-center text-muted-foreground">
            <Inbox className="mb-2 h-6 w-6 opacity-60" />
            <p className="text-xs">No applications yet</p>
          </div>
        ) : (
          items.map((a) => (
            <DraggableCard key={a.id} app={a} onClick={() => onCardClick(a)} />
          ))
        )}
      </div>
    </div>
  );
}

function DraggableCard({ app, onClick }: { app: Application; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: app.id });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0 : 1,
  } as React.CSSProperties;
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="group relative">
        <button
          type="button"
          className="absolute left-1 top-1 z-10 cursor-grab rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
          {...listeners}
          aria-label="Drag"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onClick()}>
          <ApplicationCard app={app} />
        </div>
      </div>
    </div>
  );
}

function ApplicationCard({ app, dragging }: { app: Application; dragging?: boolean }) {
  const initial = (app.company?.[0] ?? "?").toUpperCase();
  return (
    <Card
      className={cn(
        "rounded-xl border bg-white p-3 shadow-sm transition-shadow hover:shadow-md",
        dragging && "rotate-2 shadow-lg",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-display text-sm font-semibold text-primary">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{app.company}</div>
          <div className="truncate text-xs text-muted-foreground">{app.role}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {safeDate(app.applied_date)}
          </div>
        </div>
      </div>
    </Card>
  );
}

function safeDate(d: string) {
  try {
    return format(new Date(d), "MMM d, yyyy");
  } catch {
    return d;
  }
}

function ApplicationDialog({
  title,
  initial,
  submitting,
  onSubmit,
  onDelete,
}: {
  title: string;
  initial?: Application;
  submitting: boolean;
  onSubmit: (values: {
    company: string;
    role: string;
    status: Status;
    applied_date: string;
    job_link?: string;
    notes?: string;
  }) => void;
  onDelete?: () => void;
}) {
  const [company, setCompany] = useState(initial?.company ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [status, setStatus] = useState<Status>(initial?.status ?? "applied");
  const [appliedDate, setAppliedDate] = useState(
    initial?.applied_date ?? new Date().toISOString().slice(0, 10),
  );
  const [jobLink, setJobLink] = useState(initial?.job_link ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  return (
    <DialogContent className="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle className="font-display">{title}</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!company.trim() || !role.trim()) {
            toast.error("Company and role are required");
            return;
          }
          onSubmit({
            company: company.trim(),
            role: role.trim(),
            status,
            applied_date: appliedDate,
            job_link: jobLink.trim() || undefined,
            notes: notes.trim() || undefined,
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="company">Company</Label>
            <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role">Role</Label>
            <Input id="role" value={role} onChange={(e) => setRole(e.target.value)} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="date">Applied date</Label>
            <Input
              id="date"
              type="date"
              value={appliedDate}
              onChange={(e) => setAppliedDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLUMNS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="link">Job link</Label>
          <Input
            id="link"
            type="url"
            placeholder="https://..."
            value={jobLink}
            onChange={(e) => setJobLink(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Recruiter contact, interview prep, salary range…"
          />
        </div>
        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          {onDelete ? (
            <Button
              type="button"
              variant="ghost"
              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              onClick={onDelete}
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {initial?.job_link && (
              <a
                href={initial.job_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Open link <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportApplicationsCSV(apps: Application[]) {
  const headers = ["company", "role", "status", "applied_date", "job_link", "notes", "created_at"];
  const lines = [headers.join(",")];
  for (const a of apps) {
    lines.push(
      [
        a.company,
        a.role,
        a.status,
        a.applied_date,
        a.job_link ?? "",
        a.notes ?? "",
        a.created_at,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `careerlift-applications-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  toast.success(`Exported ${apps.length} application${apps.length === 1 ? "" : "s"}`);
}
