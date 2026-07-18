import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StatusEnum = z.enum(["applied", "interview", "offer", "rejected"]);

const ApplicationInput = z.object({
  company: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  status: StatusEnum.default("applied"),
  applied_date: z.string().min(1),
  job_link: z.string().url().max(1000).optional().or(z.literal("").transform(() => undefined)),
  notes: z.string().max(5000).optional().or(z.literal("").transform(() => undefined)),
});

// Internal audit helper — writes to audit_log via the same user's RLS-scoped client.
async function audit(
  supabase: { from: (t: string) => { insert: (row: unknown) => Promise<{ error: unknown }> } },
  userId: string,
  eventType: string,
  resourceId: string | null,
  status: "ok" | "denied" | "error" = "ok",
  metadata: Record<string, unknown> = {},
) {
  try {
    await supabase.from("audit_log").insert({
      user_id: userId,
      event_type: eventType,
      resource_type: "job_application",
      resource_id: resourceId,
      status,
      metadata,
    });
  } catch {
    /* best-effort */
  }
}

export const listApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("job_applications")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ApplicationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("job_applications")
      .insert({ ...data, user_id: context.userId })
      .select("*")
      .single();
    if (error) {
      await audit(context.supabase as never, context.userId, "application.create", null, "error", { error: error.message });
      throw new Error(error.message);
    }
    await audit(context.supabase as never, context.userId, "application.create", row?.id ?? null, "ok", { company: data.company, role: data.role });
    return row;
  });

export const updateApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        company: z.string().min(1).max(200).optional(),
        role: z.string().min(1).max(200).optional(),
        status: StatusEnum.optional(),
        applied_date: z.string().optional(),
        job_link: z.string().max(1000).nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("job_applications")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      await audit(context.supabase as never, context.userId, "application.update", id, "error", { error: error.message });
      throw new Error(error.message);
    }
    await audit(context.supabase as never, context.userId, "application.update", id, "ok", { changed: Object.keys(patch) });
    return row;
  });

export const deleteApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("job_applications").delete().eq("id", data.id);
    if (error) {
      await audit(context.supabase as never, context.userId, "application.delete", data.id, "error", { error: error.message });
      throw new Error(error.message);
    }
    await audit(context.supabase as never, context.userId, "application.delete", data.id, "ok");
    return { ok: true };
  });
