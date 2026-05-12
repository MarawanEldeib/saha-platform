/**
 * SAH-152 Phase 5: notification fan-out for Match events.
 *
 * Fire-and-forget. The caller (server action) should `void` the promise so
 * the user-facing response isn't blocked on push/WhatsApp delivery.
 * Errors are captured into Sentry; no exceptions propagate up.
 *
 * All routes use the admin Supabase client because the caller's auth
 * context is the sender, not the recipient — RLS would hide the recipient's
 * web_push_subscriptions and profile.phone rows otherwise.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/web-push";
import { sendWhatsApp } from "@/lib/twilio";
import { captureRouteError } from "@/lib/sentry-helpers";
import { format } from "date-fns";

interface MatchSummary {
    id: string;
    title: string;
    scheduled_for: string;
    location_text: string | null;
    host_name: string;
}

const ROUTE = "match-notifications";

function appUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL ?? "https://sahasports.vercel.app";
}

function whenLine(scheduledForIso: string): string {
    try {
        return format(new Date(scheduledForIso), "EEE MMM d · h:mm a");
    } catch {
        return scheduledForIso;
    }
}

async function lookupMatch(matchId: string): Promise<MatchSummary | null> {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (admin as any)
        .from("matchmaking_posts")
        .select(`
            id, title, scheduled_for, location_text, user_id,
            profiles!matchmaking_posts_user_id_fkey(display_name)
        `)
        .eq("id", matchId)
        .single();
    if (!data) return null;
    return {
        id: data.id,
        title: data.title,
        scheduled_for: data.scheduled_for,
        location_text: data.location_text,
        host_name: data.profiles?.display_name ?? "A player",
    };
}

async function lookupRecipientPhone(userId: string): Promise<{
    phone: string | null;
    phone_verified: boolean;
    display_name: string | null;
}> {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (admin as any)
        .from("profiles")
        .select("phone, phone_verified, display_name")
        .eq("id", userId)
        .single();
    return {
        phone: (data as { phone: string | null } | null)?.phone ?? null,
        phone_verified: Boolean((data as { phone_verified?: boolean } | null)?.phone_verified),
        display_name: (data as { display_name: string | null } | null)?.display_name ?? null,
    };
}

// ---------------------------------------------------------------------------
// notifyMatchInvites — fan out to every invitee.
// ---------------------------------------------------------------------------
export async function notifyMatchInvites(matchId: string, inviteeUserIds: string[]): Promise<void> {
    try {
        if (inviteeUserIds.length === 0) return;
        const match = await lookupMatch(matchId);
        if (!match) return;

        const url = `${appUrl()}/en/matches/${match.id}`;
        const whatsappLines = [
            `🏓 You're invited to a match on Saha!`,
            `*${match.title}*`,
            `🗓 ${whenLine(match.scheduled_for)}`,
            match.location_text ? `📍 ${match.location_text}` : null,
            `👤 Host: ${match.host_name}`,
            ``,
            `Tap to accept or decline: ${url}`,
        ].filter(Boolean).join("\n");

        await Promise.all(inviteeUserIds.map(async (uid) => {
            // Push (cheap, fire-and-forget).
            await sendPushToUser(uid, {
                title: `${match.host_name} invited you to a match`,
                body: `${match.title} · ${whenLine(match.scheduled_for)}`,
                url: `/en/matches/${match.id}`,
                tag: `match-invite:${match.id}`,
            });

            // WhatsApp — verified phones only (SAH-79 rule).
            const recipient = await lookupRecipientPhone(uid);
            if (recipient.phone && recipient.phone_verified) {
                try {
                    await sendWhatsApp(recipient.phone, whatsappLines);
                } catch (err) {
                    captureRouteError(err, {
                        route: ROUTE,
                        extra: { phase: "whatsapp_invite", match_id: match.id, invitee: uid },
                    });
                }
            }
        }));
    } catch (err) {
        captureRouteError(err, { route: ROUTE, extra: { phase: "invite_fanout", match_id: matchId } });
    }
}

// ---------------------------------------------------------------------------
// notifyJoinRequestDecision — accept / decline of a join request.
// ---------------------------------------------------------------------------
export async function notifyJoinRequestDecision(
    matchId: string,
    requesterUserId: string,
    decision: "accepted" | "declined",
): Promise<void> {
    try {
        const match = await lookupMatch(matchId);
        if (!match) return;
        const accepted = decision === "accepted";
        await sendPushToUser(requesterUserId, {
            title: accepted
                ? `${match.host_name} accepted your request`
                : `${match.host_name} declined your request`,
            body: `${match.title} · ${whenLine(match.scheduled_for)}`,
            url: `/en/matches/${match.id}`,
            tag: `join-decision:${match.id}`,
        });
    } catch (err) {
        captureRouteError(err, {
            route: ROUTE,
            extra: { phase: "join_decision_fanout", match_id: matchId, requester: requesterUserId },
        });
    }
}

// ---------------------------------------------------------------------------
// notifyMatchChat — new message in a match's chat thread.
// ---------------------------------------------------------------------------
export async function notifyMatchChat(
    matchId: string,
    senderId: string,
    body: string,
): Promise<void> {
    try {
        const admin = createAdminClient();
        // Recipients = participants minus sender.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: parts } = await (admin as any)
            .from("match_participants")
            .select("user_id")
            .eq("match_id", matchId);
        const recipients = ((parts ?? []) as Array<{ user_id: string }>)
            .map((p) => p.user_id)
            .filter((id) => id !== senderId);
        if (recipients.length === 0) return;

        // Sender display name
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: sender } = await (admin as any)
            .from("profiles").select("display_name").eq("id", senderId).single();
        const senderName = (sender as { display_name: string | null } | null)?.display_name ?? "A player";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: matchRow } = await (admin as any)
            .from("matchmaking_posts").select("title").eq("id", matchId).single();
        const matchTitle = (matchRow as { title: string } | null)?.title ?? "your match";

        const preview = body.length > 140 ? `${body.slice(0, 137)}…` : body;

        await Promise.all(recipients.map((uid) => sendPushToUser(uid, {
            title: `${senderName} in ${matchTitle}`,
            body: preview,
            url: `/en/matches/${matchId}`,
            tag: `match-chat:${matchId}`,
        })));
    } catch (err) {
        captureRouteError(err, {
            route: ROUTE,
            extra: { phase: "chat_fanout", match_id: matchId, sender: senderId },
        });
    }
}
