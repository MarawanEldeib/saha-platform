"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Check, ChevronDown, Plus } from "lucide-react";
import { setActiveFacilityAction } from "@/app/[locale]/dashboard/actions";

interface Facility {
    id: string;
    name: string;
}

interface Props {
    facilities: Facility[];
    activeFacilityId: string | null;
    locale: string;
}

export function FacilitySwitcher({ facilities, activeFacilityId, locale }: Props) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();

    const active = facilities.find((f) => f.id === activeFacilityId) ?? facilities[0];

    if (!active) {
        // Owner has no facilities yet — link straight to onboarding.
        return (
            <Link
                href={`/${locale}/dashboard/onboarding`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
            >
                <Plus className="h-4 w-4" />
                Add your first facility
            </Link>
        );
    }

    const switchTo = (id: string) => {
        if (id === active.id) {
            setOpen(false);
            return;
        }
        startTransition(async () => {
            await setActiveFacilityAction(id);
            setOpen(false);
            router.refresh();
        });
    };

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                disabled={isPending}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
                <span className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="truncate">{active.name}</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
            </button>

            {open && (
                <>
                    <button
                        type="button"
                        aria-label="Close switcher"
                        onClick={() => setOpen(false)}
                        className="fixed inset-0 z-10"
                    />
                    <div className="absolute z-20 mt-1 w-full min-w-[14rem] bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg p-1 max-h-72 overflow-auto">
                        {facilities.map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => switchTo(f.id)}
                                className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-start"
                            >
                                <span className="truncate">{f.name}</span>
                                {f.id === active.id && <Check className="h-4 w-4 text-emerald-500 shrink-0" />}
                            </button>
                        ))}
                        <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                        <Link
                            href={`/${locale}/dashboard/onboarding`}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2 px-2.5 py-2 rounded-md text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                        >
                            <Plus className="h-4 w-4" />
                            Add new facility
                        </Link>
                        <Link
                            href={`/${locale}/dashboard/facilities`}
                            onClick={() => setOpen(false)}
                            className="block px-2.5 py-2 rounded-md text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            Manage all facilities
                        </Link>
                    </div>
                </>
            )}
        </div>
    );
}
