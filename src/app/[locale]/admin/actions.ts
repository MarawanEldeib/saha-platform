"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { logAuditEvent } from "@/lib/audit";

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

