import { createClient } from "@/lib/supabase/server";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { FacilityStatusBadge } from "@/components/ui/Badge";
import { listOwnerFacilities, getActiveFacility } from "@/lib/facility-context";
import { ActiveSwitchButton } from "./ActiveSwitchButton";

export const metadata = { title: "Your Facilities — Saha" };

export default async function FacilitiesListPage() {
    const supabase = await createClient();
    const locale = await getLocale();
    const t = await getTranslations("dashboard_facilities");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const facilities = await listOwnerFacilities(supabase, user.id);
    const active = await getActiveFacility(supabase, user.id);

    return (
        <div className="max-w-3xl space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("description")}</p>
                </div>
                <Link
                    href={`/${locale}/dashboard/onboarding`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"
                >
                    <Plus className="h-4 w-4" />
                    {t("add_button")}
                </Link>
            </div>

            {facilities.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
                    <Building2 className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 mb-4">{t("empty_state")}</p>
                    <Link
                        href={`/${locale}/dashboard/onboarding`}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                        <Plus className="h-4 w-4" />
                        {t("add_first_button")}
                    </Link>
                </div>
            ) : (
                <ul className="space-y-3">
                    {facilities.map((f) => {
                        const isActive = f.id === active?.id;
                        return (
                            <li
                                key={f.id}
                                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex items-center justify-between gap-4"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h2 className="font-semibold text-gray-900 dark:text-white truncate">{f.name}</h2>
                                        <FacilityStatusBadge status={f.status} />
                                        {isActive && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                                {t("active_label")}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        /{locale}/f/{f.slug}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {!isActive && <ActiveSwitchButton facilityId={f.id} />}
                                    <Link
                                        href={`/${locale}/f/${f.slug}`}
                                        className="text-sm font-medium px-3 py-1.5 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                        {t("view_link")}
                                    </Link>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
