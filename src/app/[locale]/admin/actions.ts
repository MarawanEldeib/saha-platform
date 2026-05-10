"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { logAuditEvent } from "@/lib/audit";
import { sanitizeTextInput } from "@/lib/utils";

type FacilityUpdate = Database["public"]["Tables"]["facilities"]["Update"];
type EventUpdate = Database["public"]["Tables"]["events"]["Update"];

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

