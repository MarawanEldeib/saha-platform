import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { CourtsClient } from "./CourtsClient";
import type { Sport } from "@/types/database";

export const metadata = { title: "Courts" };

type CourtRow = {
    id: string;
    facility_id: string;
    sport_id: number | null;
    name: string;
    capacity: number;
    price_per_hour: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    sports: { id: number; name: string; icon: string | null } | null;
};

export default async function CourtsPage() {
    const supabase = await createClient();
    const locale = await getLocale();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const { data: facilityRows } = await supabase
        .from("facilities")
        .select("id, name")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

    const facility = facilityRows?.[0] ?? null;
    if (!facility) redirect(`/${locale}/dashboard/onboarding`);

    const [{ data: courts }, { data: sports }] = await Promise.all([
        supabase
            .from("courts")
            .select("*, sports(*)")
            .eq("facility_id", facility.id)
            .order("created_at", { ascending: true }),
        supabase
            .from("sports")
            .select("*")
            .order("name"),
    ]);

    return (
        <div className="max-w-4xl">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Courts</h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Manage the courts at {facility.name}
                </p>
            </div>

            <CourtsClient
                courts={(courts as CourtRow[]) ?? []}
                sports={(sports as Sport[]) ?? []}
                facilityId={facility.id}
            />
        </div>
    );
}
