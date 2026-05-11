"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { logAuditEvent } from "@/lib/audit";
import { sanitizeTextInput } from "@/lib/utils";
import { sanitizeEventTags } from "@/lib/event-tags";
import { geocodeAddress } from "@/lib/geocoding";
import { facilityUpdateSchema } from "@/lib/validations";

type FacilityUpdate = Database["public"]["Tables"]["facilities"]["Update"];
type EventUpdate = Database["public"]["Tables"]["events"]["Update"];
type ReviewUpdate = Database["public"]["Tables"]["reviews"]["Update"];
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
type UserRole = Database["public"]["Tables"]["profiles"]["Row"]["role"];

// ---------------------------------------------------------------------------
// Guard: only admin may call these actions
// ---------------------------------------------------------------------------
async function assertAdmin() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    const role = (profile as { role: string } | null)?.role;
    if (role !== "admin") {
        throw new Error("Forbidden");
    }

    return { supabase, adminClient: createAdminClient(), userId: user.id, role };
}

// ---------------------------------------------------------------------------
// Facilities – approve / reject
// ---------------------------------------------------------------------------
export async function approveFacilityAction(facilityId: string) {
    try {
        const { adminClient, userId, role } = await assertAdmin();

        // SAH-119: a facility without a resolved location can't appear on the
        // map or in geo-radius searches, so approving it is misleading. Block
        // approval and let the admin ask the owner to re-save the address
        // (which will geocode via SAH-119's tightened dashboard action).
        const { data: existing } = await adminClient
            .from("facilities")
            .select("location")
            .eq("id", facilityId)
            .single();
        if (!existing) return { error: "Facility not found" };
        if ((existing as { location: unknown }).location === null) {
            return {
                error: "This facility has no map coordinates yet. Ask the owner to re-save their address from the dashboard, then try approving again.",
            };
        }

        const update: FacilityUpdate = { status: "active" };
        const { error } = await adminClient
            .from("facilities")
            .update(update)
            .eq("id", facilityId);
        if (error) return { error: error.message };
        await logAuditEvent({
            actorId: userId,
            actorRole: role,
            action: "facility.approve",
            targetType: "facility",
            targetId: facilityId,
        });
        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

export async function rejectFacilityAction(facilityId: string, reason: string) {
    try {
        const { adminClient, userId, role } = await assertAdmin();
        const update: FacilityUpdate = { status: "suspended", rejection_reason: reason || null };
        const { error } = await adminClient
            .from("facilities")
            .update(update)
            .eq("id", facilityId);
        if (error) return { error: error.message };
        await logAuditEvent({
            actorId: userId,
            actorRole: role,
            action: "facility.reject",
            targetType: "facility",
            targetId: facilityId,
            metadata: { reason: reason || null },
        });
        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

// ---------------------------------------------------------------------------
// SAH-132: Admin emergency-edit of facility core details (name, description,
// address, city, postal_code, phone, website, trn). Use cases: owner is
// unreachable but the listing has a typo, broken phone, or abusive
// description. Sports / hours / photos stay owner-managed (this is "fix the
// listing", not "manage the facility").
//
// vs the owner action (updateFacilityAction in dashboard/actions.ts):
//   - skips ownership check (admin gates everything in admin/actions.ts)
//   - requires a non-empty `reason` so the audit trail explains why
//   - audits as `facility.update_admin` with previous + next values + reason
// Reuses the same sanitize + geocode pipeline so the same address validation
// applies (no silent location IS NULL — SAH-119 invariant).
// ---------------------------------------------------------------------------
export async function adminUpdateFacilityAction(
    facilityId: string,
    raw: {
        name: string;
        description: string;
        address: string;
        city: string;
        postal_code: string;
        phone: string;
        website: string;
        trn: string;
    },
    reason: string,
) {
    try {
        const { adminClient, userId, role } = await assertAdmin();

        const trimmedReason = (reason ?? "").trim();
        if (!trimmedReason) {
            return { error: "Please provide a reason for the admin edit (required for the audit log)." };
        }

        const sanitized = {
            name: sanitizeTextInput(raw.name ?? ""),
            description: sanitizeTextInput(raw.description ?? ""),
            address: sanitizeTextInput(raw.address ?? ""),
            city: sanitizeTextInput(raw.city ?? ""),
            postal_code: sanitizeTextInput(raw.postal_code ?? ""),
            phone: (raw.phone ?? "") || undefined,
            website: (raw.website ?? "") || undefined,
            trn: (raw.trn ?? "") || undefined,
        };
        const parsed = facilityUpdateSchema.safeParse(sanitized);
        if (!parsed.success) return { error: parsed.error.issues[0].message };

        // Snapshot previous values for the audit trail.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await (adminClient as any)
            .from("facilities")
            .select("name, description, address, city, postal_code, phone, website, trn, owner_id")
            .eq("id", facilityId)
            .single();
        if (!existing) return { error: "Facility not found" };

        // Only re-geocode when the address or city actually changed — saves
        // a Mapbox call and keeps the location stable for typo-only edits.
        const addressChanged =
            parsed.data.address !== existing.address || parsed.data.city !== existing.city;

        let locationUpdate: Partial<FacilityUpdate> = {};
        if (addressChanged) {
            const geo = await geocodeAddress(parsed.data.address, parsed.data.city);
            if (geo.status === "no_match") {
                return {
                    error: "We couldn't locate that address on the map. Double-check the street and city, then try again.",
                };
            }
            if (geo.status === "ok") {
                locationUpdate = { location: geo.wkt as never };
            }
        }

        const update: FacilityUpdate = {
            ...parsed.data,
            phone: parsed.data.phone ?? null,
            website: parsed.data.website ?? null,
            trn: parsed.data.trn || null,
            updated_at: new Date().toISOString(),
            ...locationUpdate,
        };

        const { error } = await adminClient
            .from("facilities")
            .update(update)
            .eq("id", facilityId);
        if (error) return { error: error.message };

        await logAuditEvent({
            actorId: userId,
            actorRole: role,
            action: "facility.update_admin",
            targetType: "facility",
            targetId: facilityId,
            metadata: {
                reason: trimmedReason,
                owner_id: existing.owner_id,
                previous: {
                    name: existing.name,
                    description: existing.description,
                    address: existing.address,
                    city: existing.city,
                    postal_code: existing.postal_code,
                    phone: existing.phone,
                    website: existing.website,
                    trn: existing.trn,
                },
                next: parsed.data,
                geocoded: addressChanged,
            },
        });
        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

// ---------------------------------------------------------------------------
// Events – approve / reject
// ---------------------------------------------------------------------------
export async function approveEventAction(eventId: string) {
    try {
        const { adminClient, userId, role } = await assertAdmin();
        const update: EventUpdate = { status: "approved" };
        const { error } = await adminClient
            .from("events")
            .update(update)
            .eq("id", eventId);
        if (error) return { error: error.message };
        await logAuditEvent({
            actorId: userId,
            actorRole: role,
            action: "event.approve",
            targetType: "event",
            targetId: eventId,
        });
        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

export async function rejectEventAction(eventId: string) {
    try {
        const { adminClient, userId, role } = await assertAdmin();
        const update: EventUpdate = { status: "rejected" };
        const { error } = await adminClient
            .from("events")
            .update(update)
            .eq("id", eventId);
        if (error) return { error: error.message };
        await logAuditEvent({
            actorId: userId,
            actorRole: role,
            action: "event.reject",
            targetType: "event",
            targetId: eventId,
        });
        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

// ---------------------------------------------------------------------------
// SAH-131: Admin event content edit. Unlike the owner edit
// (updateEventAction in dashboard/actions.ts) this:
//   - skips the ownership check (admin can edit any event)
//   - does NOT reset status to 'pending' — admin edits are typically
//     fixing typos/dates while keeping the existing approval state.
//   - logs `event.update_admin` with previous values so the audit trail
//     captures what the admin changed.
// ---------------------------------------------------------------------------
export async function adminUpdateEventAction(
    eventId: string,
    raw: { name: string; description: string; event_date: string; tags?: string[] },
) {
    try {
        const { adminClient, userId, role } = await assertAdmin();

        const name = sanitizeTextInput(raw.name ?? "");
        const description = sanitizeTextInput(raw.description ?? "");
        const eventDate = raw.event_date;
        const tags = sanitizeEventTags(raw.tags);

        if (!name || name.length < 3) return { error: "Event name must be at least 3 characters." };
        if (!eventDate) return { error: "Please select an event date." };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await (adminClient as any)
            .from("events")
            .select("name, description, event_date, tags")
            .eq("id", eventId)
            .single();
        if (!existing) return { error: "Event not found" };

        const update: EventUpdate = {
            name,
            description: description || null,
            event_date: eventDate,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tags: tags as any,
        };
        const { error } = await adminClient
            .from("events")
            .update(update)
            .eq("id", eventId);
        if (error) return { error: error.message };

        await logAuditEvent({
            actorId: userId,
            actorRole: role,
            action: "event.update_admin",
            targetType: "event",
            targetId: eventId,
            metadata: {
                previous: {
                    name: existing.name,
                    description: existing.description,
                    event_date: existing.event_date,
                    tags: existing.tags,
                },
                next: { name, description: description || null, event_date: eventDate, tags },
            },
        });
        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

// ---------------------------------------------------------------------------
// SAH-130: Reviews — moderation
//
// `hideReviewAction`   — soft delete (sets hidden_at / hidden_by / reason).
//                        Hidden rows are filtered out of public SELECT by RLS
//                        but stay in the DB so we can audit / unhide later.
// `unhideReviewAction` — clears hidden_*. Re-exposes the row.
// `adminDeleteReviewAction` — hard delete. The owner can also delete their
//                        own (SAH-124); this lets admin delete any.
// ---------------------------------------------------------------------------
export async function hideReviewAction(reviewId: string, reason: string) {
    try {
        const { adminClient, userId, role } = await assertAdmin();
        const update: ReviewUpdate = {
            hidden_at: new Date().toISOString(),
            hidden_by: userId,
            hidden_reason: reason || null,
        };
        const { error } = await adminClient
            .from("reviews")
            .update(update)
            .eq("id", reviewId);
        if (error) return { error: error.message };
        await logAuditEvent({
            actorId: userId,
            actorRole: role,
            action: "review.hide",
            targetType: "review",
            targetId: reviewId,
            metadata: { reason: reason || null },
        });
        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

export async function unhideReviewAction(reviewId: string) {
    try {
        const { adminClient, userId, role } = await assertAdmin();
        const update: ReviewUpdate = {
            hidden_at: null,
            hidden_by: null,
            hidden_reason: null,
        };
        const { error } = await adminClient
            .from("reviews")
            .update(update)
            .eq("id", reviewId);
        if (error) return { error: error.message };
        await logAuditEvent({
            actorId: userId,
            actorRole: role,
            action: "review.unhide",
            targetType: "review",
            targetId: reviewId,
        });
        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

export async function adminDeleteReviewAction(reviewId: string) {
    try {
        const { adminClient, userId, role } = await assertAdmin();

        // Snapshot the row before deletion so the audit trail captures what
        // was removed (rating + comment + facility_id).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: snapshot } = await (adminClient as any)
            .from("reviews")
            .select("rating, comment, facility_id, user_id, created_at")
            .eq("id", reviewId)
            .single();

        const { error } = await adminClient
            .from("reviews")
            .delete()
            .eq("id", reviewId);
        if (error) return { error: error.message };
        await logAuditEvent({
            actorId: userId,
            actorRole: role,
            action: "review.delete_admin",
            targetType: "review",
            targetId: reviewId,
            metadata: { snapshot: snapshot ?? null },
        });
        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

// ---------------------------------------------------------------------------
// SAH-139: Admin user management.
//
// `adminBanUser`    — soft delete. Sets profiles.deletion_requested_at = now()
//                     (the existing GDPR cron picks it up after 30 days), and
//                     signs the user out of all sessions immediately. The row
//                     is kept for audit + ops.
// `adminUnbanUser`  — clears deletion_requested_at.
// `adminChangeRole` — promote/demote between user / business / admin.
// `adminDeleteUser` — hard delete via auth.admin.deleteUser (PDPL right to
//                     erasure). Cascade drops the profile row.
// ---------------------------------------------------------------------------

const VALID_ROLES = ["user", "business", "admin"] as const;

export async function adminBanUserAction(targetUserId: string, reason: string) {
    try {
        const { adminClient, userId, role } = await assertAdmin();
        if (targetUserId === userId) return { error: "You can't ban yourself." };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await (adminClient as any)
            .from("profiles")
            .select("display_name, role, deletion_requested_at")
            .eq("id", targetUserId)
            .single();
        if (!existing) return { error: "User not found." };
        if (existing.deletion_requested_at) return { error: "User is already banned." };

        const update: ProfileUpdate = { deletion_requested_at: new Date().toISOString() };
        const { error } = await adminClient
            .from("profiles")
            .update(update)
            .eq("id", targetUserId);
        if (error) return { error: error.message };

        // Force sign-out across all sessions so the ban takes effect immediately.
        // Failure here isn't fatal — the DB flag still bans them on next request.
        try { await adminClient.auth.admin.signOut(targetUserId); } catch { /* */ }

        await logAuditEvent({
            actorId: userId,
            actorRole: role,
            action: "user.ban",
            targetType: "profile",
            targetId: targetUserId,
            metadata: {
                reason: sanitizeTextInput(reason || "") || null,
                snapshot: { display_name: existing.display_name, role: existing.role },
            },
        });

        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

export async function adminUnbanUserAction(targetUserId: string) {
    try {
        const { adminClient, userId, role } = await assertAdmin();
        if (targetUserId === userId) return { error: "Nothing to unban for yourself." };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await (adminClient as any)
            .from("profiles")
            .select("display_name, deletion_requested_at")
            .eq("id", targetUserId)
            .single();
        if (!existing) return { error: "User not found." };
        if (!existing.deletion_requested_at) return { error: "User is not banned." };

        const update: ProfileUpdate = { deletion_requested_at: null };
        const { error } = await adminClient
            .from("profiles")
            .update(update)
            .eq("id", targetUserId);
        if (error) return { error: error.message };

        await logAuditEvent({
            actorId: userId,
            actorRole: role,
            action: "user.unban",
            targetType: "profile",
            targetId: targetUserId,
            metadata: { display_name: existing.display_name },
        });

        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

export async function adminChangeUserRoleAction(targetUserId: string, newRole: string) {
    try {
        const { adminClient, userId, role } = await assertAdmin();
        if (!(VALID_ROLES as readonly string[]).includes(newRole)) {
            return { error: "Invalid role." };
        }
        if (targetUserId === userId) return { error: "You can't change your own role." };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await (adminClient as any)
            .from("profiles")
            .select("display_name, role")
            .eq("id", targetUserId)
            .single();
        if (!existing) return { error: "User not found." };
        if (existing.role === newRole) return { error: `User is already ${newRole}.` };

        const update: ProfileUpdate = { role: newRole as UserRole };
        const { error } = await adminClient
            .from("profiles")
            .update(update)
            .eq("id", targetUserId);
        if (error) return { error: error.message };

        await logAuditEvent({
            actorId: userId,
            actorRole: role,
            action: "user.role_change",
            targetType: "profile",
            targetId: targetUserId,
            metadata: {
                display_name: existing.display_name,
                previous_role: existing.role,
                next_role: newRole,
            },
        });

        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

export async function adminDeleteUserAction(targetUserId: string, confirmText: string) {
    try {
        const { adminClient, userId, role } = await assertAdmin();
        if (targetUserId === userId) return { error: "You can't delete yourself." };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await (adminClient as any)
            .from("profiles")
            .select("display_name, role")
            .eq("id", targetUserId)
            .single();
        if (!existing) return { error: "User not found." };

        // Friction guard: admin must type the display name to confirm. If the
        // profile has no display_name, fall back to the UUID prefix.
        const expected = (existing.display_name as string | null)?.trim() || targetUserId.slice(0, 8);
        if (confirmText.trim() !== expected) {
            return { error: `Type "${expected}" exactly to confirm deletion.` };
        }

        const { error: authErr } = await adminClient.auth.admin.deleteUser(targetUserId);
        if (authErr) return { error: authErr.message };

        // profiles cascades on auth.users delete (FK ON DELETE CASCADE) but
        // we log first so the audit row exists before the row is gone. The
        // audit row's target_id stays valid even though the profile is gone.
        await logAuditEvent({
            actorId: userId,
            actorRole: role,
            action: "user.delete",
            targetType: "profile",
            targetId: targetUserId,
            metadata: {
                snapshot: { display_name: existing.display_name, role: existing.role },
            },
        });

        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

