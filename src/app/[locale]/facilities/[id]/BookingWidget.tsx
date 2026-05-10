"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    getAvailableSlotsAction,
    createBookingAndCheckoutAction,
    createRecurringBookingAndCheckoutAction,
} from "@/app/[locale]/dashboard/actions";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/utils";
import type { PrayerWindow } from "@/lib/prayer-times";
import { findOverlappingWindow } from "@/lib/prayer-times";
import { SessionTypeBadge } from "@/components/booking/SessionTypeBadge";

type Court = {
    id: string;
    name: string;
    price_per_hour: number;
    sport_id: number | null;
};

type Slot = {
    id: string;
    start_time: string;
    end_time: string;
    session_type?: string;
};

type Props = {
    facilityId: string;
    courts: Court[];
    isLoggedIn: boolean;
    locale: string;
    /** Facility's currency code, e.g. "AED" / "SAR". */
    currency?: string;
    /** Caller's wallet balance in AED (SAH-93). 0 when no credit. */
    walletBalance?: number;
};

export function BookingWidget({ facilityId, courts, isLoggedIn, locale, currency = "AED", walletBalance = 0 }: Props) {
    const t = useTranslations("booking_widget");
    const tw = useTranslations("wallet");
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [courtId, setCourtId] = useState(courts[0]?.id ?? "");
    const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const [slots, setSlots] = useState<Slot[] | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [weeks, setWeeks] = useState(1);
    const [useWalletCredit, setUseWalletCredit] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // SAH-143 Phase A: prayer-aware slots — opt-in toggle. When enabled, we
    // fetch the day's blocked windows for this facility and grey out any
    // slot overlapping a window.
    const [avoidPrayerTimes, setAvoidPrayerTimes] = useState(false);
    const [prayerWindows, setPrayerWindows] = useState<PrayerWindow[]>([]);

    useEffect(() => {
        if (!avoidPrayerTimes || !date) return;
        let abort = false;
        (async () => {
            try {
                const res = await fetch(`/api/prayer-times?facility_id=${facilityId}&date=${date}`);
                if (!res.ok) return;
                const json = (await res.json()) as { windows?: PrayerWindow[] };
                if (!abort) setPrayerWindows(json.windows ?? []);
            } catch {
                /* network errors fall back to "no windows" — booking stays unaffected */
            }
        })();
        return () => { abort = true; };
    }, [avoidPrayerTimes, date, facilityId]);

    const selectedCourt = courts.find((c) => c.id === courtId);

    async function handleCheckAvailability() {
        if (!courtId || !date) return;
        setError(null);
        setSelectedSlot(null);
        setLoadingSlots(true);
        const result = await getAvailableSlotsAction(courtId, date);
        if (result.ok) {
            setSlots(result.slots);
        } else {
            // SAH-128: surface specific reasons instead of a silent empty list.
            const key = `slots_error_${result.code}` as
                | "slots_error_past_date" | "slots_error_no_court"
                | "slots_error_no_slots_defined" | "slots_error_all_booked"
                | "slots_error_error";
            setError(t(key));
            setSlots([]); // keep the no-slots region visible but empty
        }
        setLoadingSlots(false);
    }

    function handleBook() {
        if (!selectedSlot || !courtId) return;
        setError(null);
        startTransition(async () => {
            // Wallet credit only applies to single-booking flow for now —
            // recurring series spend logic is a follow-up.
            const credit = weeks === 1 && useWalletCredit ? walletBalance : undefined;
            const result = weeks > 1
                ? await createRecurringBookingAndCheckoutAction(selectedSlot.id, 1, weeks)
                : await createBookingAndCheckoutAction(selectedSlot.id, 1, credit);
            if ("error" in result) {
                setError(result.error);
                setSlots(null);
                setSelectedSlot(null);
            } else if (result.checkoutUrl) {
                window.location.href = result.checkoutUrl;
            }
        });
    }

    if (!isLoggedIn) {
        return (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-center space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">{t("sign_in_prompt")}</p>
                <a
                    href={`/${locale}/login`}
                    className="block w-full px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                    {t("sign_in")}
                </a>
            </div>
        );
    }

    if (courts.length === 0) {
        return (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">{t("no_courts")}</p>
            </div>
        );
    }

    const durationHours = selectedSlot
        ? (() => {
            const [sh, sm] = selectedSlot.start_time.split(":").map(Number);
            const [eh, em] = selectedSlot.end_time.split(":").map(Number);
            return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
        })()
        : 0;
    const perWeekPrice = selectedCourt ? Math.round(selectedCourt.price_per_hour * durationHours * 100) / 100 : 0;
    const totalPrice = Math.round(perWeekPrice * weeks * 100) / 100;

    return (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">{t("heading")}</h3>

            {/* Court selector */}
            <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t("court_label")}</label>
                <select
                    value={courtId}
                    onChange={(e) => { setCourtId(e.target.value); setSlots(null); setSelectedSlot(null); }}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                    {courts.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.name} — {formatPrice(c.price_per_hour, currency, locale)}/hr
                        </option>
                    ))}
                </select>
            </div>

            {/* Date picker */}
            <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t("date_label")}</label>
                <input
                    type="date"
                    value={date}
                    min={format(new Date(), "yyyy-MM-dd")}
                    onChange={(e) => { setDate(e.target.value); setSlots(null); setSelectedSlot(null); }}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
            </div>

            {/* SAH-143 Phase A: avoid prayer times toggle */}
            <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                <input
                    type="checkbox"
                    checked={avoidPrayerTimes}
                    onChange={(e) => {
                        setAvoidPrayerTimes(e.target.checked);
                        setSelectedSlot(null);
                        if (!e.target.checked) setPrayerWindows([]);
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>{t("avoid_prayer_times")}</span>
            </label>

            {/* Check availability button */}
            <button
                onClick={handleCheckAvailability}
                disabled={loadingSlots}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
                {loadingSlots ? t("checking") : t("check_availability")}
            </button>

            {/* SAH-128: prominent error/diagnostic banner. Shown for both
                availability failures and booking failures so the user always
                gets a clear reason. */}
            {error && (
                <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400" role="alert">
                    {error}
                </div>
            )}

            {/* Repeat weekly (SAH-91) */}
            <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t("repeat_label")}</label>
                <select
                    value={weeks}
                    onChange={(e) => setWeeks(Number(e.target.value))}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                    <option value={1}>{t("repeat_once")}</option>
                    <option value={2}>{t("repeat_n_weeks", { n: 2 })}</option>
                    <option value={4}>{t("repeat_n_weeks", { n: 4 })}</option>
                    <option value={8}>{t("repeat_n_weeks", { n: 8 })}</option>
                    <option value={12}>{t("repeat_n_weeks", { n: 12 })}</option>
                </select>
            </div>

            {/* Slots — only show the grid when we have results. Empty + error
                state is handled above by the diagnostic banner; empty + no
                error means the widget hasn't been used yet. */}
            {slots !== null && slots.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                    {slots.map((slot) => {
                        const overlap = avoidPrayerTimes
                            ? findOverlappingWindow(slot.start_time.slice(0, 5), slot.end_time.slice(0, 5), prayerWindows)
                            : null;
                        const isBlocked = !!overlap;
                        const isSelected = selectedSlot?.id === slot.id;
                        return (
                            <button
                                key={slot.id}
                                onClick={() => {
                                    if (isBlocked) return;
                                    setSelectedSlot(isSelected ? null : slot);
                                }}
                                disabled={isBlocked}
                                title={overlap ? t("overlaps_prayer", { name: overlap.name }) : undefined}
                                className={`text-xs px-2 py-2 rounded-lg border transition-colors ${
                                    isBlocked
                                        ? "border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 cursor-not-allowed"
                                        : isSelected
                                            ? "border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                                            : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-500"
                                }`}
                            >
                                <span className="block">{slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}</span>
                                {slot.session_type && slot.session_type !== "mixed" && (
                                    <span className="block mt-1"><SessionTypeBadge type={slot.session_type} /></span>
                                )}
                                {isBlocked && (
                                    <span className="block text-[10px] mt-0.5 opacity-80">🕌 {overlap!.name}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Booking summary + button */}
            {selectedSlot && selectedCourt && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">{t("total")}</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{formatPrice(totalPrice, currency, locale)}</span>
                    </div>

                    {/* SAH-93: wallet credit redemption — only on single-week flow.
                        Capped server-side to platform fee (10%) so owner stays whole. */}
                    {walletBalance > 0 && weeks === 1 && (
                        <label className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 cursor-pointer">
                            <div className="flex items-center gap-2 min-w-0">
                                <input
                                    type="checkbox"
                                    checked={useWalletCredit}
                                    onChange={(e) => setUseWalletCredit(e.target.checked)}
                                    className="rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
                                />
                                <span className="text-xs font-medium text-emerald-900 dark:text-emerald-200">
                                    {tw("apply_credit", { amount: formatPrice(walletBalance, "AED", locale) })}
                                </span>
                            </div>
                        </label>
                    )}

                    {/* Booking errors are surfaced in the prominent banner above. */}
                    <button
                        onClick={handleBook}
                        disabled={isPending}
                        className="w-full px-4 py-2.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                        {isPending ? t("processing") : t("book_now")}
                    </button>
                </div>
            )}
        </div>
    );
}
