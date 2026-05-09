import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AvailabilityClient } from "./AvailabilityClient";
import { getActiveFacility } from "@/lib/facility-context";

export const metadata = { title: "Availability" };

type SlotRow = {
    id: string;
    court_id: string;
    date: string;
    start_time: string;
    end_time: string;
    is_booked: boolean;
    created_at: string;
};

type CourtOption = {
    id: string;
    name: string;
    sports: { name: string } | null;
};

export default async function AvailabilityPage({
    searchParams,
}: {
    searchParams: Promise<{ court?: string; date?: string }>;
}) {
    const { court: courtParam, date: dateParam } = await searchParams;
    const supabase = await createClient();
    const locale = await getLocale();
    const t = await getTranslations("dashboard_availability");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const facility = await getActiveFacility(supabase, user.id);
    if (!facility) redirect(`/${locale}/dashboard/onboarding`);

    const { data: courts } = await supabase
        .from("courts")
        .select("id, name, sports(name)")
        .eq("facility_id", facility.id)
        .eq("is_active", true)
        .order("name");

    if (!courts || courts.length === 0) redirect(`/${locale}/dashboard/courts`);

    const selectedCourtId = courtParam && courts.some((c) => c.id === courtParam)
        ? courtParam
        : courts[0].id;

    const today = new Date().toISOString().split("T")[0];
    const selectedDate = dateParam ?? today;

    const { data: slots } = await supabase
        .from("court_availability")
        .select("*")
        .eq("court_id", selectedCourtId)
        .eq("date", selectedDate)
        .order("start_time");

    return (
        <div className="max-w-3xl">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("heading")}</h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("description")}</p>
            </div>

            <AvailabilityClient
                courts={courts as CourtOption[]}
                slots={(slots as SlotRow[]) ?? []}
                selectedCourtId={selectedCourtId}
                selectedDate={selectedDate}
                today={today}
            />
        </div>
    );
}
