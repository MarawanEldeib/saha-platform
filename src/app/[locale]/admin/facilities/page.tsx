import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { FacilityStatusBadge } from "@/components/ui/Badge";
import { format } from "date-fns";
import type { FacilityStatus } from "@/types/database";

interface PendingFacility {
    id: string;
    name: string;
    status: FacilityStatus;
    city: string;
    created_at: string;
    profiles: { display_name: string | null } | null;
}

export const metadata = { title: "Facility Queue – Admin" };

export default async function AdminFacilitiesPage() {
    const supabase = await createClient();
    const locale = await getLocale();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const profileResult = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if ((profileResult.data as { role: string } | null)?.role !== "admin") {
        redirect(`/${locale}`);
    }

    const { data } = await supabase
        .from("facilities")
        .select("id, name, status, city, created_at, profiles(display_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: true });

    const facilities = (data ?? []) as unknown as PendingFacility[];

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
            <div className="flex items-center gap-4">
                <Link href={`/${locale}/admin`} className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white">
                    ← Admin
                </Link>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pending Facility Verifications</h1>
            </div>

            {facilities.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center">
                    <p className="text-gray-500 dark:text-gray-400">No facilities awaiting review. All clear!</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {facilities.map((facility) => (
                            <div key={facility.id} className="flex items-center justify-between px-6 py-4 gap-4">
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium text-gray-900 dark:text-white">{facility.name}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                        {facility.city} &middot; Submitted by {facility.profiles?.display_name ?? "Unknown"} &middot; {format(new Date(facility.created_at), "PP")}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <FacilityStatusBadge status={facility.status} />
                                    <Button variant="outline" size="sm" asChild>
                                        <Link href={`/${locale}/admin/facilities/${facility.id}`}>Review</Link>
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
