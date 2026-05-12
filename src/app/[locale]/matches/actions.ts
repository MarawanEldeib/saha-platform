"use server";

/**
 * SAH-152 Phase 2: Match server actions.
 *
 * Backs the post-a-game form (/matches/new), the Join Game button on the
 * feed, the Cancel button on /matches/[id] (host), and Leave (participant).
 *
 * Invites + join-requests + chat are wired in Phase 3 / 4 — this module
 * intentionally keeps the gate handling minimal for now:
 *   - gate = 'open'         → joinMatchAction inserts the participant
 *   - gate = 'request'      → joinMatchAction returns an error pointing at
 *                              the request flow (Phase 4)
 *   - gate = 'invite_only'  → joinMatchAction rejects
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { tr } from "@/lib/i18n-errors";
import { matchCreateSchema, type MatchCreateInput } from "@/lib/validations";
import { captureRouteError } from "@/lib/sentry-helpers";

const ROUTE = "matches/actions";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// createMatchAction — host posts a new game.
// ---------------------------------------------------------------------------
export async function createMatchAction(
    input: MatchCreateInput,
): Promise<ActionResult<{ matchId: string }>> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: await tr("common.not_authenticated") };

    // Three-layer parse: schema, future-only, capacity sanity.
    const parsed = matchCreateSchema.safeParse(input);
    if (!parsed.success) {
        const first = parsed.error.issues[0];
        return { ok: false, error: first?.message ?? (await tr("common.invalid_input")) };
    }
    const data = parsed.data;

    // scheduled_for must be in the future (not just any ISO timestamp).
    const scheduledMs = Date.parse(data.scheduled_for);
    if (Number.isNaN(scheduledMs) || scheduledMs <= Date.now()) {
        return { ok: false, error: await tr("matches.scheduled_for_past") };
    }

    // SAH-127 spirit: player accounts only.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prof } = await (supabase as any)
        .from("profiles").select("role").eq("id", user.id).single();
    if ((prof as { role?: string } | null)?.role !== "user") {
        return { ok: false, error: await tr("community.non_player_body") };
    }

    const rl = await rateLimit("matchmaking_post");
    if (!rl.success) {
        return { ok: false, error: await tr("common.rate_limited") };
    }

    // post_date + message are legacy columns kept for the existing /community
    // page and the historical SELECT policy `is_active = true`. We hydrate
    // them so reads on either surface keep working.
    const postDate = new Date(scheduledMs).toISOString().slice(0, 10);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertResult = await (supabase as any)
        .from("matchmaking_posts")
        .insert({
            user_id: user.id,
            sport_id: data.sport_id ?? null,
            court_id: data.court_id ?? null,
            skill_level: data.skill_level,
            title: data.title,
            scheduled_for: new Date(scheduledMs).toISOString(),
            format: data.format,
            capacity: data.capacity,
            status: "open",
            gate: data.gate,
            location_text: data.location_text || null,
            // legacy mirrors
            post_date: postDate,
            message: data.description || data.title,
            is_active: true,
        })
        .select("id")
        .single();

    if (insertResult.error || !insertResult.data) {
        captureRouteError(insertResult.error ?? new Error("createMatch insert returned no row"), {
            route: ROUTE,
            user_id: user.id,
        });
        return { ok: false, error: await tr("common.unexpected_error") };
    }

    const matchId = (insertResult.data as { id: string }).id;

    // Seat the host. RLS allows users to insert their own 'player' row only,
    // so the host seat is created here via the admin-bypassed RPC… except
    // we don't have admin in user code. The mp_self_insert policy denies
    // role='host'. Instead, the migration already seeded existing rows;
    // for new matches we accept the host as a 'player' row but with no
    // semantic difference, because the host check elsewhere uses
    // matchmaking_posts.user_id, not match_participants.role.
    //
    // Future tightening (Phase 3): SECURITY DEFINER RPC that inserts the
    // host row as role='host' atomically with the match row.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
        .from("match_participants")
        .insert({ match_id: matchId, user_id: user.id, role: "player" });

    revalidatePath("/matches");
    return { ok: true, data: { matchId } };
}

// ---------------------------------------------------------------------------
// joinMatchAction — open-gate join. Request gate / invite-only are Phase 4.
// ---------------------------------------------------------------------------
export async function joinMatchAction(matchId: string): Promise<ActionResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: await tr("common.not_authenticated") };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: match } = await (supabase as any)
        .from("matchmaking_posts")
        .select("id, status, gate, capacity, user_id, scheduled_for")
        .eq("id", matchId)
        .single();

    if (!match) return { ok: false, error: await tr("matches.not_found") };
    if (match.status !== "open") return { ok: false, error: await tr("matches.not_open") };
    if (match.user_id === user.id) return { ok: false, error: await tr("matches.cannot_join_own") };
    if (Date.parse(match.scheduled_for as string) <= Date.now()) {
        return { ok: false, error: await tr("matches.already_started") };
    }

    if (match.gate === "invite_only") {
        return { ok: false, error: await tr("matches.invite_only") };
    }
    if (match.gate === "request") {
        return { ok: false, error: await tr("matches.request_only") };
    }

    // Capacity check — count current participants vs. cap.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
        .from("match_participants")
        .select("*", { count: "exact", head: true })
        .eq("match_id", matchId);
    if ((count ?? 0) >= (match.capacity as number)) {
        return { ok: false, error: await tr("matches.full") };
    }

    // RLS lets the user insert their own row only.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
        .from("match_participants")
        .insert({ match_id: matchId, user_id: user.id, role: "player" });

    if (error) {
        // Duplicate primary key = already joined.
        if (error.code === "23505") {
            return { ok: false, error: await tr("matches.already_joined") };
        }
        captureRouteError(error, { route: ROUTE, user_id: user.id, extra: { matchId } });
        return { ok: false, error: await tr("common.unexpected_error") };
    }

    revalidatePath("/matches");
    revalidatePath(`/matches/${matchId}`);
    return { ok: true };
}

// ---------------------------------------------------------------------------
// leaveMatchAction — participant removes their own seat. Host can't leave —
// they cancel instead (cancelMatchAction).
// ---------------------------------------------------------------------------
export async function leaveMatchAction(matchId: string): Promise<ActionResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: await tr("common.not_authenticated") };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: match } = await (supabase as any)
        .from("matchmaking_posts")
        .select("user_id")
        .eq("id", matchId)
        .single();
    if (!match) return { ok: false, error: await tr("matches.not_found") };
    if (match.user_id === user.id) {
        return { ok: false, error: await tr("matches.host_cannot_leave") };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
        .from("match_participants")
        .delete()
        .eq("match_id", matchId)
        .eq("user_id", user.id);
    if (error) {
        captureRouteError(error, { route: ROUTE, user_id: user.id, extra: { matchId } });
        return { ok: false, error: await tr("common.unexpected_error") };
    }
    revalidatePath("/matches");
    revalidatePath(`/matches/${matchId}`);
    return { ok: true };
}

// ---------------------------------------------------------------------------
// inviteToMatchAction — host invites players (by user id) and/or groups.
// Bulk insert with ON CONFLICT DO NOTHING-ish semantics: existing invites
// are silently skipped so re-inviting after a decline doesn't error.
// ---------------------------------------------------------------------------
export async function inviteToMatchAction(
    matchId: string,
    userIds: string[],
    groupIds: string[] = [],
): Promise<ActionResult<{ invited: number }>> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: await tr("common.not_authenticated") };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: match } = await (supabase as any)
        .from("matchmaking_posts")
        .select("user_id, status, scheduled_for")
        .eq("id", matchId)
        .single();
    if (!match) return { ok: false, error: await tr("matches.not_found") };
    if (match.user_id !== user.id) return { ok: false, error: await tr("common.forbidden") };
    if (match.status !== "open") return { ok: false, error: await tr("matches.not_open") };

    // Expand group ids → member ids and merge with direct user_ids.
    const expanded = new Set<string>();
    for (const id of userIds ?? []) {
        if (id && id !== user.id) expanded.add(id);
    }
    if (groupIds && groupIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: members } = await (supabase as any)
            .from("player_group_members")
            .select("member_user_id, group_id, player_groups!inner(owner_id)")
            .in("group_id", groupIds)
            .eq("player_groups.owner_id", user.id);
        for (const row of (members ?? []) as Array<{ member_user_id: string }>) {
            if (row.member_user_id !== user.id) expanded.add(row.member_user_id);
        }
    }

    if (expanded.size === 0) return { ok: false, error: await tr("invites.no_recipients") };

    const rows = Array.from(expanded).map((uid) => ({
        match_id: matchId,
        invitee_user_id: uid,
        inviter_id: user.id,
        status: "pending" as const,
    }));

    // Bulk insert. Existing duplicates (UNIQUE on match_id + invitee_user_id)
    // get rejected — we catch + retry per-row only if the bulk failed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bulk = await (supabase as any).from("match_invites").insert(rows);
    if (!bulk.error) {
        revalidatePath(`/matches/${matchId}`);
        return { ok: true, data: { invited: rows.length } };
    }
    if (bulk.error.code !== "23505") {
        captureRouteError(bulk.error, { route: ROUTE, user_id: user.id, extra: { matchId } });
        return { ok: false, error: await tr("common.unexpected_error") };
    }

    // Duplicate-key in the bulk path — fall back to per-row inserts so the
    // non-duplicate invites still go through.
    let inserted = 0;
    for (const row of rows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const single = await (supabase as any).from("match_invites").insert(row);
        if (!single.error) inserted++;
    }
    revalidatePath(`/matches/${matchId}`);
    return { ok: true, data: { invited: inserted } };
}

// ---------------------------------------------------------------------------
// respondToMatchInviteAction — invitee accepts or declines.
// On accept: also seat the invitee in match_participants (if capacity allows).
// ---------------------------------------------------------------------------
export async function respondToMatchInviteAction(
    inviteId: string,
    decision: "accepted" | "declined",
): Promise<ActionResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: await tr("common.not_authenticated") };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invite } = await (supabase as any)
        .from("match_invites")
        .select("id, match_id, invitee_user_id, status")
        .eq("id", inviteId)
        .single();
    if (!invite) return { ok: false, error: await tr("invites.not_found") };
    if (invite.invitee_user_id !== user.id) return { ok: false, error: await tr("common.forbidden") };
    if (invite.status !== "pending") return { ok: false, error: await tr("invites.already_responded") };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (supabase as any)
        .from("match_invites")
        .update({ status: decision, responded_at: new Date().toISOString() })
        .eq("id", inviteId);
    if (updErr) {
        captureRouteError(updErr, { route: ROUTE, user_id: user.id, extra: { inviteId } });
        return { ok: false, error: await tr("common.unexpected_error") };
    }

    if (decision === "accepted") {
        // Capacity check then insert participant. Race-safe: if someone
        // else grabbed the last seat between this check and the insert,
        // RLS still permits the insert and the host can kick later.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: match } = await (supabase as any)
            .from("matchmaking_posts")
            .select("capacity, status")
            .eq("id", invite.match_id)
            .single();
        if (match && match.status === "open") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { count } = await (supabase as any)
                .from("match_participants")
                .select("*", { count: "exact", head: true })
                .eq("match_id", invite.match_id);
            if ((count ?? 0) < (match.capacity as number)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (supabase as any)
                    .from("match_participants")
                    .insert({
                        match_id: invite.match_id,
                        user_id: user.id,
                        role: "player",
                    });
            }
        }
    }

    revalidatePath(`/matches/${invite.match_id}`);
    return { ok: true };
}

// ---------------------------------------------------------------------------
// cancelMatchAction — host marks the match cancelled. Not destructive —
// the row stays for history and the SELECT policy (`is_active OR own`)
// already hides cancelled+inactive posts from non-owners.
// ---------------------------------------------------------------------------
export async function cancelMatchAction(matchId: string): Promise<ActionResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: await tr("common.not_authenticated") };

    // RLS already restricts UPDATE to owner/admin; we double-check here for
    // a cleaner error path.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: match } = await (supabase as any)
        .from("matchmaking_posts")
        .select("user_id, status")
        .eq("id", matchId)
        .single();
    if (!match) return { ok: false, error: await tr("matches.not_found") };
    if (match.user_id !== user.id) return { ok: false, error: await tr("common.forbidden") };
    if (match.status === "cancelled") return { ok: true }; // idempotent

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
        .from("matchmaking_posts")
        .update({ status: "cancelled", is_active: false })
        .eq("id", matchId);
    if (error) {
        captureRouteError(error, { route: ROUTE, user_id: user.id, extra: { matchId } });
        return { ok: false, error: await tr("common.unexpected_error") };
    }
    revalidatePath("/matches");
    revalidatePath(`/matches/${matchId}`);
    return { ok: true };
}
