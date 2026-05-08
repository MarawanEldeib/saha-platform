"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActiveFacilityAction } from "../actions";

interface Props {
    facilityId: string;
}

export function ActiveSwitchButton({ facilityId }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const onClick = () => {
        startTransition(async () => {
            await setActiveFacilityAction(facilityId);
            router.refresh();
        });
    };

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={isPending}
            className="text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
            {isPending ? "Switching…" : "Set active"}
        </button>
    );
}
