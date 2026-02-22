import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { FacilityStatusBadge } from "@/components/ui/Badge";
import { format } from "date-fns";
import { MapPin, Globe, Phone } from "lucide-react";
import { FacilityReviewActions } from "./ReviewActions";
import type { FacilityStatus } from "@/types/database";

interface FacilityDetail {
    id: string;
    name: string;
    description: string | null;
    address: string;
    city: string;
    postal_code: string | null;
    phone: string | null;
    website: string | null;
    status: FacilityStatus;
    created_at: string;
    profiles: { display_name: string | null; email?: string } | null;
    facility_sports: Array<{ sports: { name: string } | null }>;
    facility_images: Array<{ id: string; storage_path: string }>;
}

export default async function AdminFacilityDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const locale = await getLocale();
    const t = await getTranslations("admin");
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("facilities")
        .select("*, profiles(display_name), facility_sports(sports(name)), facility_images(*)")
        .eq("id", id)
        .single();

    if (error || !data) notFound();

    const facility = data as unknown as FacilityDetail;

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{facility.name}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Submitted by {facility.profiles?.display_name ?? "Unknown"} on {format(new Date(facility.created_at), "PP")}
                    </p>
                </div>
                <FacilityStatusBadge status={facility.status} />
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                <div className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <MapPin className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                    {facility.address}, {facility.city}{facility.postal_code ? `, ${facility.postal_code}` : ""}
                </div>
                {facility.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                        {facility.phone}
                    </div>
                )}
                {facility.website && (
                    <div className="flex items-center gap-2 text-sm">
                        <Globe className="h-4 w-4 text-gray-400 shrink-0" />
                        <a href={facility.website} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline">
                            {facility.website}
                        </a>
                    </div>
                )}
                {facility.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{facility.description}</p>
                )}
            </div>

            {facility.facility_sports?.length > 0 && (
                <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sports offered</p>
                    <div className="flex flex-wrap gap-2">
                        {facility.facility_sports.map((fs) => (
                            <span key={fs.sports?.name} className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs rounded-full">
                                {fs.sports?.name}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Review Actions */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-5">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-4">{t("review_action")}</h2>
                <FacilityReviewActions facilityId={facility.id} locale={locale} />
            </div>
        </div>
    );
}
