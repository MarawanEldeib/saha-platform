"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ownerCancelBookingAction } from "../actions";

interface Props {
    bookingId: string;
}

export function OwnerCancelButton({ bookingId }: Props) {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleClick = () => {
        const reason = window.prompt(
            "Reason for cancellation (will be visible to ops, not the player). Player will be fully refunded."
        );
        if (reason === null) return; // user cancelled the prompt
        setError(null);
        startTransition(async () => {
            const result = await ownerCancelBookingAction(bookingId, reason ?? "");
            if (result?.error) {
                setError(result.error);
                return;
            }
            router.refresh();
        });
    };

    return (
        <div className="inline-flex flex-col items-end">
            <button
                type="button"
                onClick={handleClick}
                disabled={isPending}
                className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
            >
                {isPending ? "Cancelling…" : "Cancel & refund"}
            </button>
            {error && <span className="text-xs text-red-500 mt-1">{error}</span>}
        </div>
    );
}
