import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import Link from "next/link";
import { Settings as SettingsIcon, AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { listPlatformSettings } from "@/lib/platform-settings";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Admin · Settings — Saha" };

export default async function AdminSettingsPage() {
    const supabase = await createClient();
    const locale = await getLocale();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);
    const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single();
    if ((profile as { role: string } | null)?.role !== "admin") redirect(`/${locale}`);

    const rows = await listPlatformSettings();
    const byKey = new Map(rows.map((r) => [r.key, r] as const));

    const get = (k: string) => byKey.get(k)?.value;

    // SAH-80: surface the current admin's TOTP MFA state directly on the
    // settings page so they can enrol / re-verify without hunting for
    // /admin/2fa in the URL bar.
    const { data: factorsList } = await supabase.auth.mfa.listFactors();
    const verifiedFactors = factorsList?.totp?.filter((f) => f.status === "verified") ?? [];
    const hasFactor = verifiedFactors.length > 0;
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const aalSatisfied = aal?.currentLevel === "aal2";

    return (
        <div className="space-y-6 max-w-2xl">
            <div className="flex items-center gap-3">
                <SettingsIcon className="h-5 w-5 text-emerald-500" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Platform settings</h1>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                <div className="text-amber-700 dark:text-amber-300">
                    Settings here hot-swap behavior platform-wide. Changes are audit-logged.
                    The platform fee in particular affects every new Stripe Checkout session — verify a test booking after changing.
                </div>
            </div>

            {/* SAH-80: two-factor authentication status */}
            <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Two-factor authentication</h2>
                <div className="flex items-start gap-3">
                    {hasFactor && aalSatisfied ? (
                        <>
                            <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                            <div className="text-sm">
                                <div className="font-medium text-gray-900 dark:text-white">TOTP enrolled · session at aal2</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    Factor: {verifiedFactors[0]!.friendly_name ?? "(unnamed)"} · added{" "}
                                    {verifiedFactors[0]!.created_at
                                        ? new Date(verifiedFactors[0]!.created_at!).toLocaleDateString()
                                        : "—"}
                                </div>
                            </div>
                        </>
                    ) : hasFactor ? (
                        <>
                            <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                            <div className="text-sm">
                                <div className="font-medium text-gray-900 dark:text-white">TOTP enrolled but session at aal1</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    Verify a 6-digit code to lift this session to aal2.
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <ShieldAlert className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                            <div className="text-sm">
                                <div className="font-medium text-gray-900 dark:text-white">No second factor enrolled</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    Required for admin role. Mutating actions will be rejected until you finish enrolment.
                                </div>
                            </div>
                        </>
                    )}
                </div>
                <Link
                    href={`/${locale}/admin/2fa`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-medium hover:opacity-90"
                >
                    {hasFactor ? "Manage / re-verify" : "Enrol now"}
                </Link>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    Lost access? See <span className="font-mono">docs/RUNBOOK_ADMIN.md</span> for the Supabase factor-reset procedure.
                </p>
            </section>

            {/* Pricing */}
            <Section title="Pricing">
                <SettingsForm
                    settingKey="platform_fee_percent"
                    label="Platform fee (%)"
                    type="number"
                    initialValue={Number(get("platform_fee_percent") ?? 10)}
                    hint="Charged on top of the court price as Stripe `application_fee_amount`. Range 0–30."
                    confirm
                />
                <SettingsForm
                    settingKey="default_currency"
                    label="Default currency"
                    type="text"
                    initialValue={String(get("default_currency") ?? "AED")}
                    hint="ISO 4217 three-letter code. Facilities can override per facility row."
                />
            </Section>

            {/* Booking rules */}
            <Section title="Booking rules">
                <SettingsForm
                    settingKey="min_booking_lead_minutes"
                    label="Minimum booking lead (minutes)"
                    type="number"
                    initialValue={Number(get("min_booking_lead_minutes") ?? 60)}
                    hint="Bookings must start at least this many minutes after `now`. Range 0–1440."
                />
                <SettingsForm
                    settingKey="cancel_refund_window_hours"
                    label="Cancel-refund window (hours)"
                    type="number"
                    initialValue={Number(get("cancel_refund_window_hours") ?? 24)}
                    hint="Player cancels inside this window get a full refund. Range 0–168."
                    confirm
                />
            </Section>

            {/* Loyalty */}
            <Section title="Loyalty">
                <SettingsForm
                    settingKey="loyalty_threshold"
                    label="Loyalty threshold (bookings)"
                    type="number"
                    initialValue={Number(get("loyalty_threshold") ?? 10)}
                    hint="Bookings before a player unlocks loyalty perks. Range 1–1000."
                />
            </Section>

            {/* Feature flags */}
            <Section title="Feature flags">
                <SettingsForm
                    settingKey="feature_events"
                    label="Events module"
                    type="boolean"
                    initialValue={Boolean(get("feature_events") ?? true)}
                    hint="When off, /events and the dashboard events tab are hidden."
                />
                <SettingsForm
                    settingKey="feature_community"
                    label="Community / matchmaking"
                    type="boolean"
                    initialValue={Boolean(get("feature_community") ?? true)}
                    hint="When off, /community and the navbar entry are hidden."
                />
                <SettingsForm
                    settingKey="feature_group_booking"
                    label="Group booking + guests"
                    type="boolean"
                    initialValue={Boolean(get("feature_group_booking") ?? true)}
                    hint="When off, booking widget hides the players-count selector."
                />
                <SettingsForm
                    settingKey="feature_messaging"
                    label="Direct messages"
                    type="boolean"
                    initialValue={Boolean(get("feature_messaging") ?? true)}
                    hint="When off, /messages and the matchmaking-post Message button are hidden."
                />
            </Section>

            <p className="text-xs text-gray-400 dark:text-gray-600">
                Feature flags here are read at request time via the platform-settings reader. Some surfaces still
                check the constant at build time — wire-up happens incrementally as flags are needed.
            </p>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
            <div className="space-y-3">{children}</div>
        </section>
    );
}
