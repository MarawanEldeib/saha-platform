"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import {
    eventSchema,
    facilityUpdateSchema,
    profileUpdateSchema,
} from "@/lib/validations";

// ---------------------------------------------------------------------------
// Facility: update core details
// ---------------------------------------------------------------------------
export async function updateFacilityAction(formData: FormData) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const raw = {
        name: formData.get("name") as string,
        description: formData.get("description") as string,
        address: formData.get("address") as string,
        city: formData.get("city") as string,
        postal_code: formData.get("postal_code") as string,
        phone: (formData.get("phone") as string) || undefined,
        website: (formData.get("website") as string) || undefined,
    };

    const parsed = facilityUpdateSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const { error } = await supabase
        .from("facilities")
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq("owner_id", user.id);

    if (error) return { error: error.message };
    revalidatePath(`/${locale}/dashboard/facility`);
    return { success: true };
}

// ---------------------------------------------------------------------------
// Facility: update sports selection
// ---------------------------------------------------------------------------
export async function updateFacilitySportsAction(facilityId: string, sportIds: number[]) {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    // Verify ownership
    const { data: fac, error: ownershipError } = await supabase
        .from("facilities")
        .select("id")
        .eq("id", facilityId)
        .eq("owner_id", user.id)
        .single();
    if (ownershipError || !fac) return { error: "Facility not found or access denied" };

    // Delete all existing and re-insert selected
    const { error: deleteError } = await supabase
        .from("facility_sports")
        .delete()
        .eq("facility_id", facilityId);
    if (deleteError) return { error: deleteError.message };

    if (sportIds.length > 0) {
        const rows = sportIds.map((id) => ({ facility_id: facilityId, sport_id: id }));
        const { error } = await supabase.from("facility_sports").insert(rows);
        if (error) return { error: error.message };
    }

    revalidatePath(`/${locale}/dashboard/facility`);
    return { success: true };
}

// ---------------------------------------------------------------------------
// Events: submit a new event
// ---------------------------------------------------------------------------
export async function submitEventAction(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const name = (formData.get("name") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || "";
    const eventDate = formData.get("event_date") as string;
    const facilityId = formData.get("facility_id") as string;

    const parsed = eventSchema.safeParse({
        name,
        description,
        event_date: eventDate,
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    if (!facilityId) return { error: "No facility found. Complete onboarding first." };

    const { error } = await supabase.from("events").insert({
        facility_id: facilityId,
        submitted_by: user.id,
        name: parsed.data.name,
        description: parsed.data.description || null,
        event_date: parsed.data.event_date,
        status: "pending",
    });

    if (error) return { error: error.message };
    return { success: true };
}

// ---------------------------------------------------------------------------
// Profile: update display name
// ---------------------------------------------------------------------------
export async function updateProfileAction(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const raw = { display_name: (formData.get("display_name") as string)?.trim() };
    const parsed = profileUpdateSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const { error } = await supabase
        .from("profiles")
        .update({ display_name: parsed.data.display_name })
        .eq("id", user.id);

    if (error) return { error: error.message };
    revalidatePath("/", "layout");
    return { success: true };
}
