import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

interface AuditEvent {
    /** UUID of the acting user, or null for system events (webhook, cron). */
    actorId: string | null;
    actorRole: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
}

/**
 * Append a row to public.audit_log. Server-only — uses the service-role
 * client so it bypasses RLS. Never throws: a logging failure should not
 * break the parent action.
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
    try {
        const headerList = await headers();
        const ip =
            headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            headerList.get("x-real-ip") ??
            null;
        const userAgent = headerList.get("user-agent") ?? null;

        const supabase = createAdminClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("audit_log").insert({
            actor_id: event.actorId ?? null,
            actor_role: event.actorRole,
            action: event.action,
            target_type: event.targetType,
            target_id: event.targetId ?? null,
            metadata: event.metadata ?? null,
            ip,
            user_agent: userAgent,
        });
    } catch (err) {
        console.error("audit_log insert failed", err);
    }
}
