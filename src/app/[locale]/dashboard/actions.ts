"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import {
    facilityUpdateSchema,
    profileUpdateSchema,
} from "@/lib/validations";
import { FOCUS_SPORTS } from "@/lib/platform-config";

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
        country: formData.get("country") as string,
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

    if (sportIds.length > 0) {
        const { data: allowedSports, error: allowedSportsError } = await supabase
            .from("sports")
            .select("id")
            .in("id", sportIds)
            .in("name", [...FOCUS_SPORTS]);
        if (allowedSportsError) return { error: allowedSportsError.message };
        if ((allowedSports ?? []).length !== sportIds.length) {
            return { error: "Only padel, badminton, squash, and tennis are supported." };
        }
    }

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
