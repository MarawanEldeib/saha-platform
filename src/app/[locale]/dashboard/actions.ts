"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { facilityUpdateSchema } from "@/lib/validations";

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
    if (!parsed.success) return { error: parsed.error.errors[0].message };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: fac } = await (supabase as any)
        .from("facilities")
        .select("id")
        .eq("id", facilityId)
        .eq("owner_id", user.id)
        .single();
    if (!fac) return { error: "Facility not found or access denied" };

    // Delete all existing and re-insert selected
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("facility_sports").delete().eq("facility_id", facilityId);

    if (sportIds.length > 0) {
        const rows = sportIds.map((id) => ({ facility_id: facilityId, sport_id: id }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("facility_sports").insert(rows);
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
    const description = (formData.get("description") as string)?.trim();
    const eventDate = formData.get("event_date") as string;
    const facilityId = formData.get("facility_id") as string;

    if (!name || name.length < 3) return { error: "Event name must be at least 3 characters." };
    if (!eventDate) return { error: "Please select an event date." };
    if (!facilityId) return { error: "No facility found. Complete onboarding first." };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("events").insert({
        facility_id: facilityId,
        submitted_by: user.id,
        name,
        description: description || null,
        event_date: eventDate,
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

    const display_name = (formData.get("display_name") as string)?.trim();
    if (!display_name || display_name.length < 2) return { error: "Name must be at least 2 characters." };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
        .from("profiles")
        .update({ display_name })
        .eq("id", user.id);

    if (error) return { error: error.message };
    revalidatePath("/", "layout");
    return { success: true };
}
