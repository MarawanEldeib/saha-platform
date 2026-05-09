import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { TwoFaPanel } from "./TwoFaPanel";
import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Two-factor authentication — Saha Admin" };

export default async function AdminTwoFactorPage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string }>;
}) {
    const locale = await getLocale();
    const supabase = await createClient();
    const { next } = await searchParams;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
    if ((profile as { role: string } | null)?.role !== "admin") {
        redirect(`/${locale}`);
    }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    const { data: factorsList } = await supabase.auth.mfa.listFactors();
    const verifiedFactors = factorsList?.totp?.filter((f) => f.status === "verified") ?? [];
    const hasVerifiedFactor = verifiedFactors.length > 0;

    // Already at aal2 — they don't need the challenge. Bounce.
    if (aal?.currentLevel === "aal2") {
        redirect(next ?? `/${locale}/admin`);
    }

    return (
        <div className="max-w-md mx-auto px-4 py-12 space-y-6">
            <div className="text-center space-y-2">
                <ShieldCheck className="h-10 w-10 mx-auto text-emerald-500" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {hasVerifiedFactor ? "Verify your authenticator" : "Set up two-factor authentication"}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {hasVerifiedFactor
                        ? "Enter the 6-digit code from your authenticator app to continue to the admin panel."
                        : "Admin accounts require TOTP. Scan the QR with Google Authenticator, 1Password, or any compatible app."}
                </p>
            </div>

            <TwoFaPanel
                mode={hasVerifiedFactor ? "challenge" : "enroll"}
                factorId={verifiedFactors[0]?.id ?? null}
                nextPath={next ?? `/${locale}/admin`}
            />
        </div>
    );
}
