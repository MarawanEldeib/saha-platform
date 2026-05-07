"use client";

import { useState, useTransition } from "react";
import { CheckCircle, AlertCircle } from "lucide-react";

type Props = {
    isConnected: boolean;
};

export function StripeConnectSection({ isConnected }: Props) {
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
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Stripe Payments</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Connect your Stripe account to receive payments directly from players. We take a {10}% platform fee per booking.
            </p>

            {isConnected ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle className="h-4 w-4" />
                    Stripe account connected
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>Not connected — players cannot book your courts until you connect Stripe.</span>
                    </div>
                    {error && <p className="text-sm text-red-500">{error}</p>}
                    <button
                        onClick={handleConnect}
                        disabled={isPending}
                        className="px-4 py-2 rounded-lg bg-[#635BFF] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                        {isPending ? "Redirecting…" : "Connect Stripe"}
                    </button>
                </div>
            )}
        </div>
    );
}
