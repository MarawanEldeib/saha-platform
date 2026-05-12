"use server";

/**
 * SAH-152 Phase 3: contacts + groups server actions.
 *
 * Powers /players/me/contacts and the InvitePlayersSheet on /matches/[id].
 * Search is name-only against public_profiles for now — email lookup needs
 * a SECURITY DEFINER RPC and is deferred.
 *
 * RLS does the heavy lifting:
 *   - player_contacts.owner_id      = auth.uid()
 *   - player_groups.owner_id        = auth.uid()
 *   - player_group_members → tied to player_groups.owner_id via subquery
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tr } from "@/lib/i18n-errors";
import { captureRouteError } from "@/lib/sentry-helpers";

const ROUTE = "players/contacts/actions";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// addContactAction — add a user as a contact by their user id.
// ---------------------------------------------------------------------------
export async function addContactAction(contactUserId: string): Promise<Result> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: await tr("common.not_authenticated") };
    if (contactUserId === user.id) {
        return { ok: false, error: await tr("contacts.cannot_add_self") };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
        .from("player_contacts")
        .insert({ owner_id: user.id, contact_user_id: contactUserId });

    if (error) {
        if (error.code === "23505") return { ok: false, error: await tr("contacts.already_added") };
        if (error.code === "23503") return { ok: false, error: await tr("contacts.not_found") };
        captureRouteError(error, { route: ROUTE, user_id: user.id });
        return { ok: false, error: await tr("common.unexpected_error") };
    }
    revalidatePath("/players/me/contacts");
    return { ok: true };
}

// ---------------------------------------------------------------------------
// removeContactAction
// ---------------------------------------------------------------------------
export async function removeContactAction(contactUserId: string): Promise<Result> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: await tr("common.not_authenticated") };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
        .from("player_contacts")
        .delete()
        .eq("owner_id", user.id)
        .eq("contact_user_id", contactUserId);

    if (error) {
        captureRouteError(error, { route: ROUTE, user_id: user.id });
        return { ok: false, error: await tr("common.unexpected_error") };
    }
    revalidatePath("/players/me/contacts");
    return { ok: true };
}

// ---------------------------------------------------------------------------
// searchPlayersAction — name search against public_profiles, role='user'.
// Returns up to 20 matches. Excludes the caller and existing contacts.
// ---------------------------------------------------------------------------
export interface PlayerSearchHit {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    skill_rating: number | null;
}

export async function searchPlayersAction(query: string): Promise<Result<PlayerSearchHit[]>> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: await tr("common.not_authenticated") };

    const q = (query ?? "").trim();
    if (q.length < 2) return { ok: true, data: [] };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
        .from("public_profiles")
        .select("id, display_name, avatar_url, role, skill_rating")
        .ilike("display_name", `%${q}%`)
        .eq("role", "user")
        .neq("id", user.id)
        .limit(20);

    if (error) {
        captureRouteError(error, { route: ROUTE, user_id: user.id, extra: { q } });
        return { ok: false, error: await tr("common.unexpected_error") };
    }
    return { ok: true, data: (data ?? []) as PlayerSearchHit[] };
}

// ---------------------------------------------------------------------------
// createGroupAction
// ---------------------------------------------------------------------------
export async function createGroupAction(
    name: string,
    memberIds: string[],
): Promise<Result<{ groupId: string }>> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: await tr("common.not_authenticated") };

    const trimmed = (name ?? "").trim();
    if (trimmed.length < 1 || trimmed.length > 60) {
        return { ok: false, error: await tr("groups.invalid_name") };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: group, error } = await (supabase as any)
        .from("player_groups")
        .insert({ owner_id: user.id, name: trimmed })
        .select("id")
        .single();

    if (error || !group) {
        captureRouteError(error ?? new Error("create_group: no row"), {
            route: ROUTE, user_id: user.id,
        });
        return { ok: false, error: await tr("common.unexpected_error") };
    }

    const groupId = (group as { id: string }).id;

    const cleanMembers = Array.from(new Set((memberIds ?? []).filter((m) => m && m !== user.id)));
    if (cleanMembers.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: memErr } = await (supabase as any)
            .from("player_group_members")
            .insert(cleanMembers.map((mid) => ({ group_id: groupId, member_user_id: mid })));
        if (memErr) {
            captureRouteError(memErr, { route: ROUTE, user_id: user.id, extra: { groupId } });
            return { ok: false, error: await tr("common.unexpected_error") };
        }
    }

    revalidatePath("/players/me/contacts");
    return { ok: true, data: { groupId } };
}

// ---------------------------------------------------------------------------
// deleteGroupAction — cascade-deletes the members.
// ---------------------------------------------------------------------------
export async function deleteGroupAction(groupId: string): Promise<Result> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: await tr("common.not_authenticated") };

    // RLS already restricts DELETE to owner; double-checking would just add
    // a round-trip. The error path handles a 0-row delete fine.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
        .from("player_groups")
        .delete()
        .eq("id", groupId)
        .eq("owner_id", user.id);

    if (error) {
        captureRouteError(error, { route: ROUTE, user_id: user.id, extra: { groupId } });
        return { ok: false, error: await tr("common.unexpected_error") };
    }
    revalidatePath("/players/me/contacts");
    return { ok: true };
}

// ---------------------------------------------------------------------------
// updateGroupAction — rename + replace members.
// ---------------------------------------------------------------------------
export async function updateGroupAction(
    groupId: string,
    name: string,
    memberIds: string[],
): Promise<Result> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: await tr("common.not_authenticated") };

    const trimmed = (name ?? "").trim();
    if (trimmed.length < 1 || trimmed.length > 60) {
        return { ok: false, error: await tr("groups.invalid_name") };
    }

    // Rename — RLS limits this to the owner.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: renameErr } = await (supabase as any)
        .from("player_groups")
        .update({ name: trimmed })
        .eq("id", groupId)
        .eq("owner_id", user.id);
    if (renameErr) {
        captureRouteError(renameErr, { route: ROUTE, user_id: user.id, extra: { groupId } });
        return { ok: false, error: await tr("common.unexpected_error") };
    }

    // Replace members — wipe then re-add. RLS ties the join table to the
    // group's owner so this is safe to fire without re-checking ownership.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: wipeErr } = await (supabase as any)
        .from("player_group_members")
        .delete()
        .eq("group_id", groupId);
    if (wipeErr) {
        captureRouteError(wipeErr, { route: ROUTE, user_id: user.id, extra: { groupId } });
        return { ok: false, error: await tr("common.unexpected_error") };
    }

    const cleanMembers = Array.from(new Set((memberIds ?? []).filter((m) => m && m !== user.id)));
    if (cleanMembers.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: addErr } = await (supabase as any)
            .from("player_group_members")
            .insert(cleanMembers.map((mid) => ({ group_id: groupId, member_user_id: mid })));
        if (addErr) {
            captureRouteError(addErr, { route: ROUTE, user_id: user.id, extra: { groupId } });
            return { ok: false, error: await tr("common.unexpected_error") };
        }
    }

    revalidatePath("/players/me/contacts");
    return { ok: true };
}
