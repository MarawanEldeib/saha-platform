import { createClient } from "@/lib/supabase/server";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/app/[locale]/dashboard/settings/ProfileForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Account Settings – Saha" };

export default async function AccountSettingsPage() {
    const supabase = await createClient();
    const locale = await getLocale();
    const t = await getTranslations("account");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("display_name, phone, phone_verified, avatar_url, trn")
        .eq("id", user.id)
        .single();

    return (
        <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("subtitle")}</p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5">{t("profile_section")}</h2>
                <ProfileForm
                    initialName={profile?.display_name || ""}
                    initialPhone={profile?.phone || ""}
                    initialAvatar={profile?.avatar_url || null}
                    initialPhoneVerified={!!profile?.phone_verified}
                    initialTrn={profile?.trn || ""}
                />
            </div>
        </div>
    );
}
