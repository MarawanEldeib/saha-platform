"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Loader2, X, Calendar } from "lucide-react";
import { useTranslations } from "next-intl";
import { getAvailableSlotsAction, moveBookingAction } from "@/app/[locale]/dashboard/actions";

interface Slot { id: string; start_time: string; end_time: string }

interface Props {
    bookingId: string;
    courtId: string;
    currentAvailabilityId: string;
    currentStartTime: string;
    currentEndTime: string;
}

export function MoveBookingPanel({
    bookingId,
    courtId,
    currentAvailabilityId,
    currentStartTime,
    currentEndTime,
}: Props) {
    const t = useTranslations("move_booking");
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const today = new Date().toISOString().split("T")[0];
    const [date, setDate] = useState(today);
    const [slots, setSlots] = useState<Slot[]>([]);
    const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const expectedDuration =
        (new Date(`1970-01-01T${currentEndTime}`).getTime() -
            new Date(`1970-01-01T${currentStartTime}`).getTime()) / 60_000;

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        // Loading + selection reset are bound to deps changing; the
        // canonical fetch-on-dep-change pattern.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoadingSlots(true);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedSlotId(null);
        getAvailableSlotsAction(courtId, date).then((res) => {
            if (cancelled) return;
            const sameDuration = (res.slots ?? []).filter((s) => {
                const dur =
                    (new Date(`1970-01-01T${s.end_time}`).getTime() -
                        new Date(`1970-01-01T${s.start_time}`).getTime()) / 60_000;
                return dur === expectedDuration && s.id !== currentAvailabilityId;
            });
            setSlots(sameDuration);
            setLoadingSlots(false);
        });
        return () => { cancelled = true; };
    }, [open, courtId, date, expectedDuration, currentAvailabilityId]);

    function handleConfirm() {
        if (!selectedSlotId) return;
        setError(null);
        startTransition(async () => {
            const res = await moveBookingAction(bookingId, selectedSlotId);
            if (res.error) {
                setError(res.error);
                return;
            }
            setOpen(false);
            router.refresh();
        });
    }

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
                <ArrowRightLeft className="h-4 w-4" />
                {t("trigger")}
            </button>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-gray-900 dark:text-white">{t("heading")}</h3>
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    aria-label={t("close")}
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("rules")}</p>

            <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {t("date_label")}
                </span>
                <input
                    type="date"
                    value={date}
                    min={today}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100"
                />
            </label>

            <div className="min-h-[80px]">
                {loadingSlots ? (
                    <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                    </div>
                ) : slots.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">{t("no_slots")}</p>
                ) : (
                    <div className="grid grid-cols-3 gap-2">
                        {slots.map((s) => {
                            const isSel = selectedSlotId === s.id;
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => setSelectedSlotId(s.id)}
                                    className={`px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                                        isSel
                                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
                                            : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400"
                                    }`}
                                >
                                    {s.start_time.slice(0, 5)}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {error && <p className="text-xs text-red-500" role="alert">{error}</p>}

            <button
                type="button"
                onClick={handleConfirm}
                disabled={!selectedSlotId || pending}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {pending ? t("moving") : t("confirm")}
            </button>
        </div>
    );
}
