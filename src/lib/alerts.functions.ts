import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AlertSeverity = "info" | "warning" | "error" | "critical";
export type AlertCategory = "auth" | "realtime" | "api" | "client" | "server";

export const recordAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      severity: AlertSeverity;
      category: AlertCategory;
      message: string;
      context?: Record<string, unknown>;
    }) => {
      if (!input?.message || input.message.length > 500) throw new Error("message required");
      if (!input.severity || !input.category) throw new Error("severity/category required");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("system_alerts" as never).insert({
      user_id: context.userId,
      severity: data.severity,
      category: data.category,
      message: data.message.slice(0, 500),
      context: (data.context ?? {}) as never,
    } as never);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const getRecentAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("system_alerts" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      severity: AlertSeverity;
      category: AlertCategory;
      message: string;
      context: string;
      resolved: boolean;
      created_at: string;
    }>;
  });

export const resolveAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("id required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("system_alerts" as never)
      .update({ resolved: true } as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
