"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import type { Database } from "@/types/database";

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

    if ((profile as { role: string } | null)?.role !== "admin") {
        throw new Error("Forbidden");
    }

    return { supabase, adminClient: createAdminClient() };
}

// ---------------------------------------------------------------------------
// Facilities – approve / reject
// ---------------------------------------------------------------------------
export async function approveFacilityAction(facilityId: string) {
    try {
        const { adminClient } = await assertAdmin();
        const update: FacilityUpdate = { status: "active" };
        const { error } = await adminClient
            .from("facilities")
            .update(update)
            .eq("id", facilityId);
        if (error) return { error: error.message };
        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

export async function rejectFacilityAction(facilityId: string, reason: string) {
    try {
        const { adminClient } = await assertAdmin();
        const update: FacilityUpdate = { status: "suspended", rejection_reason: reason || null };
        const { error } = await adminClient
            .from("facilities")
            .update(update)
            .eq("id", facilityId);
        if (error) return { error: error.message };
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
        const { adminClient } = await assertAdmin();
        const update: EventUpdate = { status: "approved" };
        const { error } = await adminClient
            .from("events")
            .update(update)
            .eq("id", eventId);
        if (error) return { error: error.message };
        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

export async function rejectEventAction(eventId: string) {
    try {
        const { adminClient } = await assertAdmin();
        const update: EventUpdate = { status: "rejected" };
        const { error } = await adminClient
            .from("events")
            .update(update)
            .eq("id", eventId);
        if (error) return { error: error.message };
        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

// ---------------------------------------------------------------------------
// Email Campaign – send via Resend
// ---------------------------------------------------------------------------
export async function sendEmailCampaignAction(formData: FormData) {
    try {
        await assertAdmin();
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unauthorized" };
    }

    const subject = formData.get("subject") as string;
    const body = formData.get("body") as string;
    const emailsRaw = formData.get("emails") as string;

    if (!subject || !body || !emailsRaw) {
        return { error: "Subject, body, and email list are required." };
    }

    // Basic RFC-5322 pattern — more robust than a bare .includes("@")
    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emails = emailsRaw
        .split(/[\n,]+/)
        .map((e) => e.trim())
        .filter((e) => EMAIL_PATTERN.test(e));

    if (emails.length === 0) return { error: "No valid email addresses found." };

    const resend = new Resend(process.env.RESEND_API_KEY!);
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < emails.length; i += 50) {
        const batch = emails.slice(i, i + 50);
        const { error } = await resend.emails.send({
            from: "Saha <noreply@saha.app>",
            to: batch,
            subject,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        ${body}
        <hr style="margin:24px 0;border:none;border-top:1px solid #eee;" />
        <p style="font-size:12px;color:#999;">
          You received this email because your facility is listed on Saha.
          To unsubscribe, reply with "unsubscribe".
        </p>
      </div>`,
        });
        if (error) failed += batch.length;
        else sent += batch.length;
    }

    return { sent, failed };
}
