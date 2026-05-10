"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { logAuditEvent } from "@/lib/audit";

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

