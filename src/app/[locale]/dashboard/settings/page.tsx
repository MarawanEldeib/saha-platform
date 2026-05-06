import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { ProfileForm } from "./ProfileForm";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "Settings – Saha" };

export default async function SettingsPage() {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("display_name, role")
        .eq("id", user.id)
        .single();

    return (
        <div className="max-w-2xl space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage your account profile and security.</p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5">Profile Information</h2>
                <ProfileForm initialName={profile?.display_name || ""} />
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl">
                        <ShieldCheck className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Two-Factor Authentication</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-4">
                            Protect your business account with an authenticator app (TOTP). This will be required for admin actions.
                        </p>
                        <Button variant="outline" asChild>
                            <Link href={`/${locale}/2fa/setup`} className="inline-flex items-center gap-2">
                                Configure 2FA
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
