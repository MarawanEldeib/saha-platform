import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const COOKIE_NAME = "saha_facility_id";
// Cookie persists for a year — owners stay on the same facility unless they
// explicitly switch.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type SahaClient = SupabaseClient<Database>;

export interface ActiveFacility {
    id: string;
    name: string;
    slug: string;
    status: "pending" | "active" | "suspended";
    stripe_account_id: string | null;
    currency: string;
}

/**
 * Returns the owner's currently-selected facility. Reads the cookie set by
 * setActiveFacilityAction; if missing or pointing at a facility the user no
 * longer owns, falls back to the most recently created facility for this
 * owner. Returns null if the owner has no facilities yet.
 *
 * Always validates ownership against the DB so a stolen/forged cookie can't
 * surface someone else's facility.
 */
export async function getActiveFacility(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: SahaClient | any,
    userId: string,
): Promise<ActiveFacility | null> {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(COOKIE_NAME)?.value;

    // Try the cookie first.
    if (cookieValue) {
        const { data } = await supabase
            .from("facilities")
            .select("id, name, slug, status, stripe_account_id, currency")
            .eq("id", cookieValue)
            .eq("owner_id", userId)
            .single();
        if (data) return data as ActiveFacility;
    }

    // Cookie missing or invalid — fall back to most recent.
    const { data } = await supabase
        .from("facilities")
        .select("id, name, slug, status, stripe_account_id, currency")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);

    return (data?.[0] as ActiveFacility) ?? null;
}

/**
 * Lists all facilities owned by the user, used by the switcher dropdown +
 * the /dashboard/facilities list page. Sorted oldest-first so the original
 * facility comes first by default.
 */
export async function listOwnerFacilities(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: SahaClient | any,
    userId: string,
): Promise<ActiveFacility[]> {
    const { data } = await supabase
        .from("facilities")
        .select("id, name, slug, status, stripe_account_id, currency")
        .eq("owner_id", userId)
        .order("created_at", { ascending: true });
    return (data as ActiveFacility[]) ?? [];
}

export const FACILITY_COOKIE_NAME = COOKIE_NAME;
export const FACILITY_COOKIE_MAX_AGE = COOKIE_MAX_AGE;
