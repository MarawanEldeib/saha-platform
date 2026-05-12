"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cancelBookingSeriesAction } from "@/app/[locale]/dashboard/actions";

interface Props {
    /** Any booking ID in the series — server expands to siblings via recurring_group_id. */
    bookingId: string;
    /** How many future occurrences will be cancelled — drives the confirm copy. */
    remainingCount: number;
}

export function CancelSeriesButton({ bookingId, remainingCount }: Props) {
    const t = useTranslations("bookings");
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    function handleCancel() {
        const message = t("cancel_series_confirm", { count: remainingCount });
        if (!confirm(message)) return;
        startTransition(async () => {
            const result = await cancelBookingSeriesAction(bookingId);
            if (result.error) {
                alert(result.error);
                return;
            }
            if (result.success) {
                alert(
                    result.refundAmount && result.refundAmount > 0
                        ? t("series_cancelled_with_refund", { count: result.cancelled, amount: result.refundAmount })
                        : t("series_cancelled", { count: result.cancelled }),
                );
                router.refresh();
            }
        });
    }

    return (
        <button
            onClick={handleCancel}
            disabled={pending}
            className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/50 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
        >
            {pending
                ? t("cancelling")
                : t("cancel_series_button", { count: remainingCount })}
        </button>
    );
}
