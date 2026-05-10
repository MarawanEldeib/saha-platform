/**
 * SAH-96 PR C: server-side web push helper.
 *
 * VAPID keys live in env vars:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  — browser uses to subscribe
 *   VAPID_PRIVATE_KEY             — server uses to sign push payloads
 *   VAPID_SUBJECT                 — mailto: URL or HTTPS URL (defaults to mailto:hello@saha.ae)
 *
 * Generate a fresh VAPID keypair locally with:
 *   npx web-push generate-vapid-keys --json
 *
 * No-ops cleanly when VAPID keys are missing (dev environments without
 * push configured) so the app doesn't crash — only logs a warning.
 */

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

let configured = false;
function configure(): boolean {
    if (configured) return true;
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
        if (process.env.NODE_ENV === "production") {
            console.warn("[web-push] VAPID keys missing — push notifications disabled");
        }
        return false;
    }
    const subject = process.env.VAPID_SUBJECT ?? "mailto:hello@saha.ae";
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
    return true;
}

interface PushPayload {
    title: string;
    body: string;
    /** Click target — relative URL or absolute. Worker calls clients.openWindow with this. */
    url: string;
    /** Optional dedupe tag — same tag replaces an existing notification. */
    tag?: string;
}

interface SubscriptionRow {
    id: string;
    endpoint: string;
    p256dh: string;
    auth_key: string;
}

/**
 * Send a push to every subscription belonging to a user. Dead subscriptions
 * (HTTP 404 / 410) are deleted so they stop wasting send-time on every
 * subsequent message. Other failures are logged and swallowed.
 *
 * Reads subscriptions via the admin client because the caller's auth
 * context is for the SENDER, not the recipient — they can't SELECT the
 * recipient's subscriptions through RLS.
 */
export async function sendPushToUser(
    userId: string,
    payload: PushPayload,
): Promise<{ sent: number; pruned: number; errors: number }> {
    if (!configure()) return { sent: 0, pruned: 0, errors: 0 };

    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (admin as any)
        .from("web_push_subscriptions")
        .select("id, endpoint, p256dh, auth_key")
        .eq("user_id", userId);
    const subs = (data ?? []) as SubscriptionRow[];
    if (subs.length === 0) return { sent: 0, pruned: 0, errors: 0 };

    const json = JSON.stringify(payload);
    let sent = 0;
    let pruned = 0;
    let errors = 0;

    await Promise.all(
        subs.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: { p256dh: sub.p256dh, auth: sub.auth_key },
                    },
                    json,
                );
                sent++;
            } catch (err: unknown) {
                const statusCode = (err as { statusCode?: number }).statusCode;
                if (statusCode === 404 || statusCode === 410) {
                    // Subscription is dead — clean it up.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await (admin as any).from("web_push_subscriptions").delete().eq("id", sub.id);
                    pruned++;
                } else {
                    console.warn("[web-push] send failed", {
                        endpoint: sub.endpoint.slice(0, 60),
                        statusCode,
                    });
                    errors++;
                }
            }
        }),
    );

    return { sent, pruned, errors };
}
