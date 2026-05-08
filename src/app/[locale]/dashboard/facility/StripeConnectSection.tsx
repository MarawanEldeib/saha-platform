"use client";

import { useState, useTransition } from "react";
import { CheckCircle, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";

type Props = {
    isConnected: boolean;
};

export function StripeConnectSection({ isConnected }: Props) {
    const t = useTranslations("facility_form");
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function handleConnect() {
        setError(null);
        startTransition(async () => {
            const res = await fetch("/api/stripe/connect", { method: "POST" });
            const json = await res.json();
            if (json.url) {
                window.location.href = json.url;
            } else {
                setError(json.error ?? "Something went wrong");
            }
        });
    }

    return (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">{t("stripe_heading")}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t("stripe_desc")}</p>

            {isConnected ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle className="h-4 w-4" />
                    {t("stripe_connected")}
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{t("stripe_not_connected")}</span>
                    </div>
                    {error && <p className="text-sm text-red-500">{error}</p>}
                    <button
                        onClick={handleConnect}
                        disabled={isPending}
                        className="px-4 py-2 rounded-lg bg-[#635BFF] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                        {isPending ? t("stripe_redirecting") : t("stripe_connect")}
                    </button>
                </div>
            )}
        </div>
    );
}
