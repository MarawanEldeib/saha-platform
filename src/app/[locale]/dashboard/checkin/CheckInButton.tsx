"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ScanLine } from "lucide-react";
import { markCheckedInAction } from "../actions";

export function CheckInButton({ bookingId }: { bookingId: string }) {
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    function handleCheckin() {
        startTransition(async () => {
            await markCheckedInAction(bookingId);
            router.refresh();
        });
    }

    return (
        <button
            onClick={handleCheckin}
            disabled={pending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
            <ScanLine className="h-4 w-4" />
            <span>{pending ? "..." : "Check in"}</span>
        </button>
    );
}
