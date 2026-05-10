"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { logAuditEvent } from "@/lib/audit";
import { sanitizeTextInput } from "@/lib/utils";
import { geocodeAddress } from "@/lib/geocoding";
import { facilityUpdateSchema } from "@/lib/validations";

type FacilityUpdate = Database["public"]["Tables"]["facilities"]["Update"];
type EventUpdate = Database["public"]["Tables"]["events"]["Update"];
type ReviewUpdate = Database["public"]["Tables"]["reviews"]["Update"];

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
    raw: { name: string; description: string; event_date: string },
) {
    try {
        const { adminClient, userId, role } = await assertAdmin();

        const name = sanitizeTextInput(raw.name ?? "");
        const description = sanitizeTextInput(raw.description ?? "");
        const eventDate = raw.event_date;

        if (!name || name.length < 3) return { error: "Event name must be at least 3 characters." };
        if (!eventDate) return { error: "Please select an event date." };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await (adminClient as any)
            .from("events")
            .select("name, description, event_date")
            .eq("id", eventId)
            .single();
        if (!existing) return { error: "Event not found" };

        const update: EventUpdate = {
            name,
            description: description || null,
            event_date: eventDate,
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
                },
                next: { name, description: description || null, event_date: eventDate },
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

