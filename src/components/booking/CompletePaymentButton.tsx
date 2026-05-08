"use client";

import { useState } from "react";
import { retryPaymentAction } from "@/app/[locale]/dashboard/actions";
import { CreditCard, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export function CompletePaymentButton({ bookingId }: { bookingId: string }) {
    const t = useTranslations("complete_payment");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleClick() {
        setLoading(true);
        setError(null);
        const result = await retryPaymentAction(bookingId);
        if (result.error) {
            setError(result.error);
            setLoading(false);
            return;
        }
        if (result.checkoutUrl) {
            window.location.href = result.checkoutUrl;
        }
    }

    return (
        <div className="space-y-2">
            <button
                onClick={handleClick}
                disabled={loading}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
            >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {loading ? t("redirecting") : t("button")}
            </button>
            {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        </div>
    );
}
