"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

// ---------------------------------------------------------------------------
// Guard: Only admin can call these actions
// ---------------------------------------------------------------------------
async function assertAdmin() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const profileResult = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    const profile = profileResult.data as { role: string } | null;
    if (profile?.role !== "admin") throw new Error("Forbidden");

    return { supabase, adminClient: createAdminClient() };
}

// ---------------------------------------------------------------------------
// Facilities – approve / reject
// ---------------------------------------------------------------------------
export async function approveFacilityAction(facilityId: string) {
    try {
        const { adminClient } = await assertAdmin();
        const result = await adminClient
            .from("facilities")
            .update({ status: "active" } as never)
            .eq("id", facilityId);
        if (result.error) return { error: result.error.message };
        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

export async function rejectFacilityAction(facilityId: string, reason: string) {
    try {
        const { adminClient } = await assertAdmin();
        const result = await adminClient
            .from("facilities")
            .update({ status: "suspended", rejection_reason: reason } as never)
            .eq("id", facilityId);
        if (result.error) return { error: result.error.message };
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
        const result = await adminClient
            .from("events")
            .update({ status: "approved" } as never)
            .eq("id", eventId);
        if (result.error) return { error: result.error.message };
        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

export async function rejectEventAction(eventId: string) {
    try {
        const { adminClient } = await assertAdmin();
        const result = await adminClient
            .from("events")
            .update({ status: "rejected" } as never)
            .eq("id", eventId);
        if (result.error) return { error: result.error.message };
        revalidatePath("/", "layout");
        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : "Unexpected error" };
    }
}

// ---------------------------------------------------------------------------
// Email Campaign — send to uploaded list via Resend
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

    const emails = emailsRaw
        .split(/[\n,]+/)
        .map((e) => e.trim())
        .filter((e) => e.includes("@"));

    if (emails.length === 0) return { error: "No valid emails found." };

    const resend = new Resend(process.env.RESEND_API_KEY!);

    let sent = 0;
    let failed = 0;

    // Send in batches of 50 (Resend batch limit)
    for (let i = 0; i < emails.length; i += 50) {
        const batch = emails.slice(i, i + 50);
        const result = await resend.emails.send({
            from: "Saha Platform <noreply@saha.app>",
            to: batch,
            subject,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        ${body}
        <hr style="margin:24px 0;border:none;border-top:1px solid #eee;" />
        <p style="font-size:12px;color:#999;">
          You received this email because you are listed as a sports facility operator in our database.
          To unsubscribe, reply with "unsubscribe".
        </p>
      </div>`,
        });
        if (result.error) failed += batch.length;
        else sent += batch.length;
    }

    return { sent, failed };
}
