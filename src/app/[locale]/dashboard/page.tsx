import { createClient } from "@/lib/supabase/server";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { FacilityStatusBadge } from "@/components/ui/Badge";
import { ArrowRight, AlertCircle } from "lucide-react";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
    const t = await getTranslations("dashboard.overview");
    const locale = await getLocale();
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user!.id).single();
    const { data: facility } = await supabase
        .from("facilities")
        .select("id, name, status")
        .eq("owner_id", user!.id)
        .maybeSingle();

    return (
        <div className="max-w-3xl space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                    {t("welcome")}, {profile?.display_name ?? ""}
                </p>
            </div>

            {!facility ? (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <AlertCircle className="h-8 w-8 text-amber-500 shrink-0" />
                    <div className="flex-1">
                        <p className="font-medium text-amber-900 dark:text-amber-300">{t("complete_onboarding")}</p>
                    </div>
                    <Button variant="primary" asChild>
                        <Link href={`/${locale}/dashboard/onboarding`}>
                            {t("start_onboarding")}
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{t("status_label")}</p>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-1">{facility.name}</h2>
                        </div>
                        <FacilityStatusBadge status={facility.status} />
                    </div>
                    <div className="flex gap-3 mt-5">
                        <Button variant="outline" size="sm" asChild>
                            <Link href={`/${locale}/dashboard/facility`}>Manage Facility</Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                            <Link href={`/${locale}/facilities/${facility.id}`}>View Public Page</Link>
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
