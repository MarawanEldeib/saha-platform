"use server";

// SAH-156: extracted from the legacy dashboard/actions.ts god module.
// Owner-facing event lifecycle: submit, edit, delete. Admin approval
// flow lives separately in admin/actions.ts.

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeTextInput } from "@/lib/utils";
import { sanitizeEventTags } from "@/lib/event-tags";
import { logAuditEvent } from "@/lib/audit";
import { tr } from "@/lib/i18n-errors";

// ---------------------------------------------------------------------------
// Events: submit a new event
// ---------------------------------------------------------------------------
export async function submitEventAction(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: await tr("common.not_authenticated") };

    const name = (formData.get("name") as string)?.trim();
    const description = (formData.get("description") as string)?.trim();
    const eventDate = formData.get("event_date") as string;
    const facilityId = formData.get("facility_id") as string;
    const tags = sanitizeEventTags(formData.getAll("tags"));

    if (!name || name.length < 3) return { error: await tr("events.name_too_short") };
    if (!eventDate) return { error: await tr("events.date_required") };
    if (!facilityId) return { error: await tr("common.no_facility_onboard") };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("events").insert({
        facility_id: facilityId,
        submitted_by: user.id,
        name,
        description: description || null,
        event_date: eventDate,
        status: "pending",
        tags,
    });

    if (error) return { error: error.message };
    return { success: true };
}

// ---------------------------------------------------------------------------
// Events: update an existing event (SAH-123).
// Owner can correct typos / change date. Resets status to 'pending' so the
// edited content goes through admin review again — otherwise an owner could
// approve a clean draft and swap content past review.
// ---------------------------------------------------------------------------
export async function updateEventAction(
    eventId: string,
    raw: { name: string; description: string; event_date: string },
) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: await tr("common.not_authenticated") };

    const name = sanitizeTextInput(raw.name ?? "");
    const description = sanitizeTextInput(raw.description ?? "");
    const eventDate = raw.event_date;

    if (!name || name.length < 3) return { error: await tr("events.name_too_short") };
    if (!eventDate) return { error: await tr("events.date_required") };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
        .from("events")
        .select("id, facility_id, status, facilities!inner(owner_id)")
        .eq("id", eventId)
        .single();
    if (!existing) return { error: await tr("events.not_found") };
    if (existing.facilities?.owner_id !== user.id) return { error: await tr("common.access_denied") };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
        .from("events")
        .update({
            name,
            description: description || null,
            event_date: eventDate,
            status: "pending",
        })
        .eq("id", eventId);

    if (error) return { error: error.message };

    await logAuditEvent({
        actorId: user.id,
        actorRole: "business",
        action: "event.update",
        targetType: "event",
        targetId: eventId,
        metadata: { facility_id: existing.facility_id, previous_status: existing.status },
    });

    revalidatePath(`/${locale}/dashboard/events`);
    return { success: true };
}

// ---------------------------------------------------------------------------
// Events: delete (SAH-123). Hard delete; owner-scoped.
// ---------------------------------------------------------------------------
export async function deleteEventAction(eventId: string) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: await tr("common.not_authenticated") };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
        .from("events")
        .select("id, name, facility_id, status, facilities!inner(owner_id)")
        .eq("id", eventId)
        .single();
    if (!existing) return { error: await tr("events.not_found") };
    if (existing.facilities?.owner_id !== user.id) return { error: await tr("common.access_denied") };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
        .from("events")
        .delete()
        .eq("id", eventId);

    if (error) return { error: error.message };

    await logAuditEvent({
        actorId: user.id,
        actorRole: "business",
        action: "event.delete",
        targetType: "event",
        targetId: eventId,
        metadata: { facility_id: existing.facility_id, name: existing.name, status: existing.status },
    });

    revalidatePath(`/${locale}/dashboard/events`);
    return { success: true };
}
