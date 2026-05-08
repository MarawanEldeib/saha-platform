"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle, AlertCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";

type Props = {
    isConnected: boolean;
};

export function StripeConnectSection({ isConnected: initialConnected }: Props) {
    const t = useTranslations("facility_form");
    const [connected, setConnected] = useState(initialConnected);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [loading, setLoading] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    async function handleDisconnect() {
        if (!confirm(t("stripe_disconnect_confirm"))) return;
        setDisconnecting(true);
        setError(null);
        try {
            const res = await fetch("/api/stripe/disconnect", { method: "POST" });
            const json = await res.json();
            if (json.error) setError(json.error);
            else setConnected(false);
        } catch {
            setError("Something went wrong. Please try again.");
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
                    setError(err instanceof Error ? err.message : "Something went wrong");
                    setShowOnboarding(false);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        init();

        return () => {
            cancelled = true;
            if (containerRef.current) containerRef.current.innerHTML = "";
        };
    }, [showOnboarding]);

    return (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">{t("stripe_heading")}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t("stripe_desc")}</p>

            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

            {connected ? (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                        <CheckCircle className="h-4 w-4" />
                        {t("stripe_connected")}
                    </div>
                    <button
                        onClick={handleDisconnect}
                        disabled={disconnecting}
                        className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                        {disconnecting ? "…" : t("stripe_disconnect")}
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{t("stripe_not_connected")}</span>
                    </div>

                    {!showOnboarding && (
                        <button
                            onClick={() => setShowOnboarding(true)}
                            disabled={loading}
                            className="px-4 py-2 rounded-lg bg-[#635BFF] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                            {loading ? t("stripe_redirecting") : t("stripe_connect")}
                        </button>
                    )}

                    {showOnboarding && (
                        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Stripe Connect</span>
                                <button
                                    onClick={() => setShowOnboarding(false)}
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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
            )}
        </div>
    );
}
