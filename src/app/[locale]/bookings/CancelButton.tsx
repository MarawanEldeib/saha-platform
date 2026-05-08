"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cancelBookingAction } from "@/app/[locale]/dashboard/actions";

export function CancelButton({ bookingId }: { bookingId: string }) {
    const t = useTranslations("bookings");
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    function handleCancel() {
        if (!confirm(t("cancel_confirm"))) return;
        startTransition(async () => {
            const result = await cancelBookingAction(bookingId);
            if (result.success) {
                alert(result.refunded ? `${t("cancelled_ok")} ${t("refunded")}` : t("cancelled_ok"));
                router.refresh();
            }
        });
    }

    return (
        <button
            onClick={handleCancel}
            disabled={pending}
            className="text-xs text-red-500 hover:text-red-600 dark:hover:text-red-400 font-medium disabled:opacity-50 transition-colors"
        >
            {pending ? t("cancelling") : t("cancel")}
        </button>
    );
}
