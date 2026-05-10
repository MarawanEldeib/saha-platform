"use server";

import { createClient } from "@/lib/supabase/server";

interface SubscribePayload {
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string;
}

/**
 * SAH-96 PR C: register a web push subscription for the current user.
 * The browser hands us a PushSubscription which we flatten and store.
 *
 * UPSERTs on (user_id, endpoint) so re-subscribing the same browser
 * refreshes the keys instead of creating duplicates.
 */
export async function subscribeWebPushAction(
    payload: SubscribePayload,
): Promise<{ ok: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated" };

    if (!payload.endpoint || !payload.p256dh || !payload.auth) {
        return { ok: false, error: "Invalid subscription payload" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
        .from("web_push_subscriptions")
        .upsert(
            {
                user_id: user.id,
                endpoint: payload.endpoint,
                p256dh: payload.p256dh,
                auth_key: payload.auth,
                user_agent: payload.userAgent ?? null,
            },
            { onConflict: "user_id,endpoint" },
        );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
}

/**
 * Remove the subscription for a given endpoint. Called when the user opts
 * out, or when the browser invalidates an old subscription.
 */
export async function unsubscribeWebPushAction(
    endpoint: string,
): Promise<{ ok: boolean }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
        .from("web_push_subscriptions")
        .delete()
        .eq("user_id", user.id)
        .eq("endpoint", endpoint);
    return { ok: true };
}
