"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CheckCircle, Clock, XCircle, MapPin, Repeat } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BookingQRCode } from "@/components/booking/BookingQRCode";
import { CompletePaymentButton } from "@/components/booking/CompletePaymentButton";
import { CancelButton } from "./CancelButton";

const STATUS_CONFIG = {
    confirmed: { icon: CheckCircle, color: "text-emerald-500", labelKey: "status_confirmed" },
    pending: { icon: Clock, color: "text-amber-400", labelKey: "status_pending" },
    cancelled: { icon: XCircle, color: "text-red-400", labelKey: "status_cancelled" },
    completed: { icon: CheckCircle, color: "text-gray-400", labelKey: "status_completed" },
    no_show: { icon: XCircle, color: "text-gray-400", labelKey: "status_no_show" },
} as const;

type Booking = {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    status: string;
    total_price: number;
    currency: string;
    qr_code_token: string | null;
    num_players: number;
    recurring_group_id: string | null;
    courts: { name: string; facilities: { name: string; address: string; city: string } } | null;
};

type Props = {
    bookings: Booking[];
    locale: string;
    appUrl: string;
};

export function BookingTabs({ bookings, locale, appUrl }: Props) {
    const t = useTranslations("bookings");
    const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

    const today = new Date().toISOString().slice(0, 10);
    const upcoming = bookings.filter(b => b.date >= today && ["confirmed", "pending"].includes(b.status));
    const past = bookings.filter(b => b.date < today || ["completed", "cancelled", "no_show"].includes(b.status));
    const list = tab === "upcoming" ? upcoming : past;

    // SAH-91: collapse recurring-group siblings into one card. Solo bookings
    // (recurring_group_id === null) and any group with only one row in this
    // tab render as before; multi-row groups render as a single grouped card.
    type GroupedItem =
        | { kind: "single"; booking: Booking }
        | { kind: "series"; firstUpcoming: Booking; siblings: Booking[] };

    const grouped = useMemo<GroupedItem[]>(() => {
        const seen = new Set<string>();
        const items: GroupedItem[] = [];
        for (const b of list) {
            if (b.recurring_group_id && !seen.has(b.recurring_group_id)) {
                const groupId = b.recurring_group_id;
                const siblings = list.filter((s) => s.recurring_group_id === groupId);
                if (siblings.length > 1) {
                    seen.add(groupId);
                    // For upcoming tab, surface the earliest still-future booking.
                    // For past tab, surface the most recent (siblings already
                    // sorted desc by date from the server query).
                    const firstUpcoming = tab === "upcoming"
                        ? [...siblings].sort((a, c) => a.date.localeCompare(c.date) || a.start_time.localeCompare(c.start_time))[0]
                        : siblings[0];
                    items.push({ kind: "series", firstUpcoming, siblings });
                    continue;
                }
            }
            if (b.recurring_group_id && seen.has(b.recurring_group_id)) continue;
            items.push({ kind: "single", booking: b });
        }
        return items;
    }, [list, tab]);

    return (
        <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
                {(["upcoming", "past"] as const).map((key) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            tab === key
                                ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                        }`}
                    >
                        {t(`tab_${key}`)}
                        <span className="ms-1.5 text-xs text-gray-400">
                            {key === "upcoming" ? upcoming.length : past.length}
                        </span>
                    </button>
                ))}
            </div>

            {list.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                    <p className="text-gray-500 dark:text-gray-400">{t(tab === "upcoming" ? "no_upcoming" : "no_past")}</p>
                    {tab === "upcoming" && (
                        <Link
                            href={`/${locale}/map`}
                            className="inline-block px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:opacity-90 transition-opacity"
                        >
                            {t("find_court")}
                        </Link>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {grouped.map((item) => {
                        if (item.kind === "series") {
                            const head = item.firstUpcoming;
                            const court = head.courts;
                            const facility = court?.facilities;
                            const total = item.siblings.reduce(
                                (sum, s) => sum + Number(s.total_price),
                                0,
                            );
                            const futureCount = item.siblings.filter(
                                (s) => s.date >= today && ["confirmed", "pending"].includes(s.status),
                            ).length;

                            return (
                                <Link
                                    key={head.recurring_group_id ?? head.id}
                                    href={`/${locale}/bookings/${head.id}`}
                                    className="block bg-white dark:bg-gray-900 border border-emerald-200 dark:border-emerald-900/40 rounded-xl overflow-hidden hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors"
                                >
                                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                                        <div className="min-w-0">
                                            <p className="font-semibold text-gray-900 dark:text-white truncate">{court?.name}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                {format(new Date(head.date), "EEEE")}s · {head.start_time.slice(0, 5)}–{head.end_time.slice(0, 5)}
                                            </p>
                                        </div>
                                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                                            <Repeat className="h-3 w-3" />
                                            {t("series_count_chip", { remaining: futureCount, total: item.siblings.length })}
                                        </span>
                                    </div>
                                    <div className="px-5 py-4 space-y-2">
                                        {facility && (
                                            <div className="flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
                                                <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                                                <span>{facility.name} — {facility.address}, {facility.city}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-500 dark:text-gray-400">
                                                {tab === "upcoming"
                                                    ? t("series_next_card", { date: format(new Date(head.date), "PP") })
                                                    : t("series_total_card", { count: item.siblings.length, total: total.toFixed(2), currency: head.currency })}
                                            </span>
                                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                                {t("view_details")}
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            );
                        }

                        const booking = item.booking;
                        const court = booking.courts;
                        const facility = court?.facilities;
                        const status = booking.status as keyof typeof STATUS_CONFIG;
                        const { icon: Icon, color, labelKey } = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
                        const isConfirmed = booking.status === "confirmed";
                        const canCancel = ["confirmed", "pending"].includes(booking.status) && booking.date >= today;

                        return (
                            <div key={booking.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                                {/* Header */}
                                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                                    <div>
                                        <p className="font-semibold text-gray-900 dark:text-white">{court?.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                            {format(new Date(booking.date), "PPP")} · {booking.start_time.slice(0, 5)}–{booking.end_time.slice(0, 5)}
                                        </p>
                                    </div>
                                    <span className={`flex items-center gap-1 text-xs font-medium ${color}`}>
                                        <Icon className="h-3.5 w-3.5" />
                                        {t(labelKey)}
                                    </span>
                                </div>

                                {/* Details */}
                                <div className="px-5 py-4 space-y-2">
                                    {facility && (
                                        <div className="flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
                                            <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                                            <span>{facility.name} — {facility.address}, {facility.city}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-500 dark:text-gray-400">
                                            {booking.num_players} {t("players")} · {booking.total_price} {booking.currency}
                                        </span>
                                        <div className="flex items-center gap-3">
                                            {canCancel && <CancelButton bookingId={booking.id} />}
                                            <Link
                                                href={`/${locale}/bookings/${booking.id}`}
                                                className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
                                            >
                                                {t("view_details")}
                                            </Link>
                                        </div>
                                    </div>
                                </div>

                                {booking.status === "pending" && (
                                    <div className="px-5 pb-4">
                                        <CompletePaymentButton bookingId={booking.id} />
                                    </div>
                                )}

                                {isConfirmed && booking.qr_code_token && (
                                    <div className="px-5 pb-4">
                                        <BookingQRCode token={booking.qr_code_token} appUrl={appUrl} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
