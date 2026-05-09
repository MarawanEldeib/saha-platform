"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle2, AlertCircle, X, CreditCard, ArrowDownToLine, BadgeCheck, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";

type Props = {
    /** Owner has linked a Stripe account (charges may still be disabled). */
    hasAccount: boolean;
    /** Stripe `charges_enabled` — true once onboarding is fully accepted. */
    chargesEnabled: boolean;
    /** Stripe `details_submitted` — owner has filled in the Connect form. */
    detailsSubmitted: boolean;
    /** Stripe `payouts_enabled` — bank/iban accepted, payouts will land. */
    payoutsEnabled: boolean;
    /** Platform-side fee, mirrored in the disclosure copy. */
    platformFeePercent: number;
};

export function StripeConnectSection({
    hasAccount: initialHasAccount,
    chargesEnabled: initialChargesEnabled,
    detailsSubmitted: initialDetailsSubmitted,
    payoutsEnabled: initialPayoutsEnabled,
    platformFeePercent,
}: Props) {
    const t = useTranslations("facility_form");
    const tStripe = useTranslations("stripe_connect");
    const [hasAccount, setHasAccount] = useState(initialHasAccount);
    const [chargesEnabled, setChargesEnabled] = useState(initialChargesEnabled);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [loading, setLoading] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const ownerSharePercent = 100 - platformFeePercent;
    // Three-state model:
    //   ready       — account exists + charges_enabled (players can pay)
    //   incomplete  — account exists but missing details / charges
    //   none        — no account at all
    const state: "ready" | "incomplete" | "none" =
        !hasAccount ? "none" : chargesEnabled ? "ready" : "incomplete";

    async function handleDisconnect() {
        if (!confirm(t("stripe_disconnect_confirm"))) return;
        setDisconnecting(true);
        setError(null);
        try {
            const res = await fetch("/api/stripe/disconnect", { method: "POST" });
            const json = await res.json();
            if (json.error) setError(json.error);
            else {
                setHasAccount(false);
                setChargesEnabled(false);
            }
        } catch {
            setError(tStripe("disconnect_error"));
        } finally {
            setDisconnecting(false);
        }
    }

    useEffect(() => {
        if (!showOnboarding || !containerRef.current) return;

        let cancelled = false;
        containerRef.current.innerHTML = "";

        async function init() {
            setLoading(true);
            setError(null);
            try {
                const { loadConnectAndInitialize } = await import("@stripe/connect-js");

                const stripeConnect = loadConnectAndInitialize({
                    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
                    fetchClientSecret: async () => {
                        const res = await fetch("/api/stripe/account-session", { method: "POST" });
                        const json = await res.json();
                        if (json.error) throw new Error(json.error);
                        return json.clientSecret;
                    },
                    appearance: {
                        overlays: "dialog",
                        variables: { colorPrimary: "#059669" },
                    },
                });

                if (cancelled) return;

                const onboarding = stripeConnect.create("account-onboarding");
                onboarding.setOnExit(() => setShowOnboarding(false));

                if (containerRef.current) {
                    containerRef.current.appendChild(onboarding);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : tStripe("disconnect_error"));
                    setShowOnboarding(false);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        init();

        const node = containerRef.current;
        return () => {
            cancelled = true;
            if (node) node.innerHTML = "";
        };
    }, [showOnboarding, tStripe]);

    return (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t("stripe_heading")}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("stripe_desc")}</p>
                </div>
                {state === "ready" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 shrink-0">
                        <BadgeCheck className="h-3.5 w-3.5" />
                        {tStripe("badge_ready")}
                    </span>
                ) : state === "incomplete" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 shrink-0">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {tStripe("badge_incomplete")}
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 shrink-0">
                        {tStripe("badge_not_connected")}
                    </span>
                )}
            </div>

            {/* Money split disclosure — visible in every state so the owner
                always knows the numbers. SAH-64 §3. */}
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-900/10 p-4 grid grid-cols-3 gap-3 text-center">
                <div>
                    <div className="flex items-center justify-center mb-1 text-emerald-600 dark:text-emerald-400">
                        <Wallet className="h-4 w-4" />
                    </div>
                    <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{ownerSharePercent}%</p>
                    <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">{tStripe("split_owner_label")}</p>
                </div>
                <div>
                    <div className="flex items-center justify-center mb-1 text-gray-500 dark:text-gray-400">
                        <CreditCard className="h-4 w-4" />
                    </div>
                    <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{platformFeePercent}%</p>
                    <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">{tStripe("split_platform_label")}</p>
                </div>
                <div>
                    <div className="flex items-center justify-center mb-1 text-emerald-600 dark:text-emerald-400">
                        <ArrowDownToLine className="h-4 w-4" />
                    </div>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{tStripe("split_payout_value")}</p>
                    <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">{tStripe("split_payout_label")}</p>
                </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">{tStripe("split_disclosure", { owner: ownerSharePercent, platform: platformFeePercent })}</p>

            {error && <p className="text-sm text-red-500">{error}</p>}

            {/* State-specific CTA */}
            {state === "ready" && !showOnboarding && (
                <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{tStripe("ready_body")}</span>
                    </div>
                    <button
                        onClick={handleDisconnect}
                        disabled={disconnecting}
                        className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                        {disconnecting ? "…" : t("stripe_disconnect")}
                    </button>
                </div>
            )}

            {state === "incomplete" && !showOnboarding && (
                <div className="space-y-3 pt-1">
                    <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{tStripe("incomplete_body")}</span>
                    </div>
                    <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 ms-6 list-disc">
                        {!initialDetailsSubmitted && <li>{tStripe("checklist_details")}</li>}
                        {!chargesEnabled && <li>{tStripe("checklist_charges")}</li>}
                        {!initialPayoutsEnabled && <li>{tStripe("checklist_payouts")}</li>}
                    </ul>
                    <button
                        onClick={() => setShowOnboarding(true)}
                        disabled={loading}
                        className="px-4 py-2 rounded-lg bg-[#635BFF] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                        {loading ? t("stripe_redirecting") : tStripe("continue_setup")}
                    </button>
                </div>
            )}

            {state === "none" && !showOnboarding && (
                <div className="space-y-3 pt-1">
                    <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{t("stripe_not_connected")}</span>
                    </div>
                    <button
                        onClick={() => setShowOnboarding(true)}
                        disabled={loading}
                        className="px-4 py-2 rounded-lg bg-[#635BFF] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                        {loading ? t("stripe_redirecting") : t("stripe_connect")}
                    </button>
                </div>
            )}

            {showOnboarding && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Stripe Connect</span>
                        <button
                            onClick={() => setShowOnboarding(false)}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            aria-label={tStripe("close")}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    {loading && (
                        <div className="flex items-center justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
                            {t("stripe_redirecting")}
                        </div>
                    )}
                    <div ref={containerRef} />
                </div>
            )}
        </div>
    );
}
