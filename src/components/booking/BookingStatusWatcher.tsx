"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface Props {
    isPending: boolean;
    justPaid: boolean;
}

// When Stripe redirects back with ?success=1 but the webhook hasn't fired yet,
// this polls the server component until the booking flips to confirmed.
export function BookingStatusWatcher({ isPending, justPaid }: Props) {
    const router = useRouter();

    useEffect(() => {
        if (!isPending || !justPaid) return;

        const interval = setInterval(() => router.refresh(), 2500);
        const timeout = setTimeout(() => clearInterval(interval), 30_000);

        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
        };
    }, [isPending, justPaid, router]);

    return null;
}
