import { createClient } from "@/lib/supabase/server";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { FacilityEditForm } from "./FacilityEditForm";
import { HoursForm } from "./HoursForm";
import { StripeConnectSection } from "./StripeConnectSection";

export const metadata = { title: "Manage Facility – Saha" };

export default async function FacilityPage() {
    const supabase = await createClient();
    const locale = await getLocale();
    const t = await getTranslations("facility_form");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: facilityRows } = await (supabase as any)
        .from("facilities")
        .select("id, name, description, address, city, postal_code, phone, website, stripe_account_id, facility_images(id, storage_path, display_order)")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
    const facility = facilityRows?.[0] ?? null;

    if (!facility) {
        redirect(`/${locale}/dashboard/onboarding`);
    }

    const [{ data: allSports }, { data: facilitySpots }, { data: hours }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("sports").select("id, name").in("name", ["Padel", "Pickleball", "Squash", "Tennis", "Badminton"]).order("name"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("facility_sports").select("sport_id").eq("facility_id", facility.id),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
            .from("facility_hours")
            .select("day_of_week, is_closed, open_time, close_time")
            .eq("facility_id", facility.id)
            .order("day_of_week"),
    ]);

    const currentSportIds: number[] = (facilitySpots ?? []).map((r: { sport_id: number }) => r.sport_id);

    return (
        <div className="max-w-2xl space-y-6">
            <div className="mb-2">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("heading")}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("subheading")}</p>
            </div>
            <FacilityEditForm
                facility={facility}
                allSports={allSports ?? []}
                currentSportIds={currentSportIds}
                initialImages={facility.facility_images ?? []}
            />
            <HoursForm
                facilityId={facility.id}
                initialHours={hours ?? []}
            />
            <StripeConnectSection isConnected={!!facility.stripe_account_id} />
        </div>
    );
}
