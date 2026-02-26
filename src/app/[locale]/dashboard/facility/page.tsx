import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { FacilityEditForm } from "./FacilityEditForm";

export const metadata = { title: "Manage Facility – Saha" };

export default async function FacilityPage() {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: facilityRows } = await (supabase as any)
        .from("facilities")
        .select("id, name, description, address, city, postal_code, phone, website")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
    const facility = facilityRows?.[0] ?? null;

    if (!facility) {
        redirect(`/${locale}/dashboard/onboarding`);
    }

    const [{ data: allSports }, { data: facilitySpots }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("sports").select("id, name").order("name"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("facility_sports").select("sport_id").eq("facility_id", facility.id),
    ]);

    const currentSportIds: number[] = (facilitySpots ?? []).map((r: { sport_id: number }) => r.sport_id);

    return (
        <div className="max-w-2xl space-y-2">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Manage Facility</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Update your facility details and sports offered.</p>
            </div>
            <FacilityEditForm
                facility={facility}
                allSports={allSports ?? []}
                currentSportIds={currentSportIds}
            />
        </div>
    );
}
