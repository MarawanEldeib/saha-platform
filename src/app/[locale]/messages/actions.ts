"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sanitizeTextInput } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { sendPushToUser } from "@/lib/web-push";
import { tr } from "@/lib/i18n-errors";

/**
 * SAH-96: send a message to another player. Wraps upsert_conversation()
 * (SECURITY DEFINER) so the row is created/found with the right sorted-pair
 * shape, then inserts the message. RLS does the role check at every layer.
 *
 * Returns the conversation id so the client can route to /messages/[id].
 */
export async function sendMessageAction(
    recipientId: string,
    body: string,
    matchmakingPostId: string | null = null,
): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: await tr("common.not_authenticated") };
    if (recipientId === user.id) return { ok: false, error: await tr("messages.cannot_self") };

    const trimmed = sanitizeTextInput(body ?? "");
    if (trimmed.length < 1) return { ok: false, error: await tr("messages.empty") };
    if (trimmed.length > 2000) return { ok: false, error: await tr("messages.too_long") };

    // 30 messages / hour / sender. Aggressive but spam pressure on
    // matchmaking is real — tune later from real traffic.
    const rl = await rateLimit("messages_send");
    if (!rl.success) {
        return { ok: false, error: `Too many messages. Try again in ${rl.retryAfter}s.` };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: convId, error: rpcErr } = await (supabase as any).rpc("upsert_conversation", {
        p_a: user.id,
        p_b: recipientId,
        p_matchmaking_post_id: matchmakingPostId,
    });
    if (rpcErr || !convId) {
        return { ok: false, error: rpcErr?.message ?? "Could not start conversation" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: msgErr } = await (supabase as any).from("messages").insert({
        conversation_id: convId,
        sender_id: user.id,
        body: trimmed,
    });
    if (msgErr) return { ok: false, error: msgErr.message };

    // Fire-and-forget web push to the recipient. Failures are logged inside
    // sendPushToUser; we don't block the user-facing response on it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: senderProfile } = await (supabase as any)
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();
    const senderName = (senderProfile as { display_name: string | null } | null)?.display_name ?? "Someone";
    void sendPushToUser(recipientId, {
        title: senderName,
        body: trimmed.length > 140 ? trimmed.slice(0, 137) + "…" : trimmed,
        url: `/en/messages/${convId}`,
        tag: `msg:${convId}`,
    });

    revalidatePath("/messages");
    return { ok: true, conversationId: convId as string };
}

/**
 * Mark all unread messages in a conversation as read by the current user.
 * RLS narrows this to messages where sender_id != caller, so the call is
 * safe even if the conversationId is leaked.
 */
export async function markMessagesReadAction(conversationId: string): Promise<{ ok: boolean }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .neq("sender_id", user.id)
        .is("read_at", null);

    revalidatePath(`/messages/${conversationId}`);
    revalidatePath("/messages");
    return { ok: true };
}
