import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { format } from "date-fns";
import { CheckCircle, Clock, XCircle, MapPin, Calendar } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { BookingQRCode } from "@/components/booking/BookingQRCode";
import { CompletePaymentButton } from "@/components/booking/CompletePaymentButton";

export const metadata = { title: "My Bookings – Saha" };

const STATUS_CONFIG = {
    confirmed: { icon: CheckCircle, color: "text-emerald-500", labelKey: "status_confirmed" },
    pending: { icon: Clock, color: "text-amber-400", labelKey: "status_pending" },
    cancelled: { icon: XCircle, color: "text-red-400", labelKey: "status_cancelled" },
    completed: { icon: CheckCircle, color: "text-gray-400", labelKey: "status_completed" },
    no_show: { icon: XCircle, color: "text-gray-400", labelKey: "status_no_show" },
} as const;

export default async function MyBookingsPage() {
    const supabase = await createClient();
    const locale = await getLocale();
    const t = await getTranslations("bookings");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const { data: bookings } = await supabase
        .from("bookings")
        .select(`
            id, date, start_time, end_time, status, total_price, currency, qr_code_token, num_players,
            courts(name, facilities(name, address, city))
        `)
        .eq("player_id", user.id)
        .order("date", { ascending: false })
        .order("start_time", { ascending: false });

    const headersList = await headers();
    const host = headersList.get("host") ?? "localhost:3000";
    const appUrl = host.startsWith("localhost") ? `http://${host}` : `https://${host}`;

    return (
        <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("subtitle")}</p>
            </div>

            {!bookings?.length ? (
                <div className="text-center py-16 space-y-3">
                    <Calendar className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto" />
                    <p className="text-gray-500 dark:text-gray-400">{t("no_bookings")}</p>
                    <Link
                        href={`/${locale}/map`}
                        className="inline-block px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                        {t("find_court")}
                    </Link>
                </div>
            ) : (
                <div className="space-y-4">
                    {bookings.map((booking) => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const court = (booking as any).courts;
                        const facility = court?.facilities;
                        const status = booking.status as keyof typeof STATUS_CONFIG;
                        const { icon: Icon, color, labelKey } = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
                        const isConfirmed = booking.status === "confirmed";

                        return (
                            <div key={booking.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                                {/* Header */}
                                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                                    <div>
                                        <p className="font-semibold text-gray-900 dark:text-white">{court?.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                            {format(new Date(booking.date), "PPP")} · {booking.start_time.slice(0, 5)} – {booking.end_time.slice(0, 5)}
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
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500 dark:text-gray-400">{booking.num_players} {t("players")} · {booking.total_price} {booking.currency}</span>
                                        <Link
                                            href={`/${locale}/bookings/${booking.id}`}
                                            className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
                                        >
                                            {t("view_details")}
                                        </Link>
                                    </div>
                                </div>

                                {/* Complete Payment — pending bookings */}
                                {booking.status === "pending" && (
                                    <div className="px-5 pb-4">
                                        <CompletePaymentButton bookingId={booking.id} />
                                    </div>
                                )}

                                {/* QR Code — confirmed bookings only */}
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
