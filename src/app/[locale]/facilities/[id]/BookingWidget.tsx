"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getAvailableSlotsAction, createBookingAndCheckoutAction } from "@/app/[locale]/dashboard/actions";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/utils";

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
};

type Props = {
    facilityId: string;
    courts: Court[];
    isLoggedIn: boolean;
    locale: string;
    /** Facility's currency code, e.g. "AED" / "SAR". */
    currency?: string;
};

export function BookingWidget({ courts, isLoggedIn, locale, currency = "AED" }: Props) {
    const t = useTranslations("booking_widget");
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [courtId, setCourtId] = useState(courts[0]?.id ?? "");
    const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const [slots, setSlots] = useState<Slot[] | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selectedCourt = courts.find((c) => c.id === courtId);

    async function handleCheckAvailability() {
        if (!courtId || !date) return;
        setError(null);
        setSelectedSlot(null);
        setLoadingSlots(true);
        const { slots: data } = await getAvailableSlotsAction(courtId, date);
        setSlots(data);
        setLoadingSlots(false);
    }

    function handleBook() {
        if (!selectedSlot || !courtId) return;
        setError(null);
        startTransition(async () => {
            const result = await createBookingAndCheckoutAction(
                selectedSlot.id,
                1,
            );
            if (result.error) {
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
    const totalPrice = selectedCourt ? Math.round(selectedCourt.price_per_hour * durationHours * 100) / 100 : 0;

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

            {/* Check availability button */}
            <button
                onClick={handleCheckAvailability}
                disabled={loadingSlots}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
                {loadingSlots ? t("checking") : t("check_availability")}
            </button>

            {/* Slots */}
            {slots !== null && (
                <div>
                    {slots.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">{t("no_slots")}</p>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            {slots.map((slot) => (
                                <button
                                    key={slot.id}
                                    onClick={() => setSelectedSlot(selectedSlot?.id === slot.id ? null : slot)}
                                    className={`text-xs px-2 py-2 rounded-lg border transition-colors ${selectedSlot?.id === slot.id
                                        ? "border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                                        : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-500"
                                        }`}
                                >
                                    {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Booking summary + button */}
            {selectedSlot && selectedCourt && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">{t("total")}</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{formatPrice(totalPrice, currency, locale)}</span>
                    </div>
                    {error && <p className="text-xs text-red-500">{error}</p>}
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
