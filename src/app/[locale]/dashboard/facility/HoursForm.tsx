"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveFacilityHoursAction } from "../actions";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const TIME_OPTIONS = Array.from({ length: 37 }, (_, i) => {
    const totalMins = 6 * 60 + i * 30;
    const h = String(Math.floor(totalMins / 60)).padStart(2, "0");
    const m = String(totalMins % 60).padStart(2, "0");
    return `${h}:${m}`;
});

type HourRow = {
    day_of_week: number;
    is_closed: boolean;
    open_time: string | null;
    close_time: string | null;
};

type Props = {
    facilityId: string;
    initialHours: HourRow[];
};

function buildDefaults(saved: HourRow[]): HourRow[] {
    return Array.from({ length: 7 }, (_, i) => {
        const existing = saved.find((h) => h.day_of_week === i);
        return existing ?? { day_of_week: i, is_closed: false, open_time: "09:00", close_time: "22:00" };
    });
}

export function HoursForm({ facilityId, initialHours }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [hours, setHours] = useState<HourRow[]>(buildDefaults(initialHours));
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    function updateDay(index: number, patch: Partial<HourRow>) {
        setHours((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)));
        setSuccess(false);
    }

    function handleSubmit() {
        setError(null);
        startTransition(async () => {
            const result = await saveFacilityHoursAction(facilityId, hours);
            if (result.error) {
                setError(result.error);
            } else {
                setSuccess(true);
                router.refresh();
            }
        });
    }

    return (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Opening Hours</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                Set your facility&apos;s weekly schedule. Players will see these hours on your profile.
            </p>

            <div className="space-y-3">
                {hours.map((row, i) => (
                    <div key={i} className="flex items-center gap-3 flex-wrap">
                        <span className="w-24 text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">
                            {DAYS[i]}
                        </span>

                        <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 shrink-0">
                            <input
                                type="checkbox"
                                checked={row.is_closed}
                                onChange={(e) => updateDay(i, { is_closed: e.target.checked })}
                                className="rounded border-gray-300 dark:border-gray-600"
                            />
                            Closed
                        </label>

                        {!row.is_closed && (
                            <>
                                <select
                                    value={row.open_time ?? "09:00"}
                                    onChange={(e) => updateDay(i, { open_time: e.target.value })}
                                    className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                >
                                    {TIME_OPTIONS.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>

                                <span className="text-sm text-gray-400">to</span>

                                <select
                                    value={row.close_time ?? "22:00"}
                                    onChange={(e) => updateDay(i, { close_time: e.target.value })}
                                    className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                >
                                    {TIME_OPTIONS.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </>
                        )}

                        {row.is_closed && (
                            <span className="text-sm text-gray-400 italic">Closed all day</span>
                        )}
                    </div>
                ))}
            </div>

            {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
            {success && <p className="mt-4 text-sm text-green-600 dark:text-green-400">Hours saved.</p>}

            <button
                onClick={handleSubmit}
                disabled={isPending}
                className="mt-6 px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
                {isPending ? "Saving…" : "Save hours"}
            </button>
        </div>
    );
}
