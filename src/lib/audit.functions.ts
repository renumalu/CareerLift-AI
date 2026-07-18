import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AuditStatus = "ok" | "denied" | "error";

export const logAuditEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      eventType: string;
      resourceType?: string;
      resourceId?: string;
      status?: AuditStatus;
      metadata?: Record<string, unknown>;
    }) => {
      if (!input?.eventType || typeof input.eventType !== "string" || input.eventType.length > 100) {
        throw new Error("eventType required (<=100 chars)");
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const ua = getRequestHeader("user-agent")?.slice(0, 300) ?? null;
    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const { error } = await context.supabase.from("audit_log" as never).insert({
      user_id: context.userId,
      event_type: data.eventType,
      resource_type: data.resourceType ?? null,
      resource_id: data.resourceId ?? null,
      status: data.status ?? "ok",
      metadata: (data.metadata ?? {}) as never,
      ip,
      user_agent: ua,
    } as never);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const getMyAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("audit_log" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      event_type: string;
      resource_type: string | null;
      resource_id: string | null;
      status: string;
      metadata: string;
      ip: string | null;
      user_agent: string | null;
      created_at: string;
    }>;
  });
