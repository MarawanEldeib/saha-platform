import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { format } from "date-fns";
import { CheckCircle, XCircle, Clock, MapPin } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { BookingQRCode } from "@/components/booking/BookingQRCode";
import { BookingShareActions } from "@/components/booking/BookingShareActions";
import { BookingStatusWatcher } from "@/components/booking/BookingStatusWatcher";
import { CompletePaymentButton } from "@/components/booking/CompletePaymentButton";

export const metadata = { title: "Booking – Saha" };

export default async function BookingPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ success?: string; cancelled?: string }>;
}) {
    const { id } = await params;
    const { success, cancelled } = await searchParams;
    const supabase = await createClient();
    const locale = await getLocale();
    const t = await getTranslations("booking_detail");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const { data: booking } = await supabase
        .from("bookings")
        .select(`
            id, date, start_time, end_time, status, total_price, currency, qr_code_token, num_players,
            courts(name, facilities(name, address, city))
        `)
        .eq("id", id)
        .eq("player_id", user.id)
        .single();

    if (!booking) notFound();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const court = (booking as any).courts;
    const facility = court?.facilities;

    const isCancelled = cancelled === "1" || booking.status === "cancelled";
    const isConfirmed = success === "1" || booking.status === "confirmed";
    const isPending = !isConfirmed && !isCancelled && booking.status === "pending";
    const justPaid = success === "1";

    const headersList = await headers();
    const host = headersList.get("host") ?? "localhost:3000";
    const appUrl = host.startsWith("localhost") ? `http://${host}` : `https://${host}`;
    const shareUrl = `${appUrl}/${locale}/booking/${booking.qr_code_token}`;

    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
            <div className="max-w-md w-full space-y-6">
                {/* Polls every 2.5s after Stripe redirect until webhook fires and status flips */}
                <BookingStatusWatcher isPending={isPending} justPaid={justPaid} />

                {/* Status header */}
                <div className="text-center">
                    {isConfirmed && !isCancelled ? (
                        <>
                            <CheckCircle className="h-14 w-14 text-emerald-500 mx-auto mb-3" />
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("confirmed_heading")}</h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("confirmed_desc")}</p>
                        </>
                    ) : isCancelled ? (
                        <>
                            <XCircle className="h-14 w-14 text-red-400 mx-auto mb-3" />
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("cancelled_heading")}</h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("cancelled_desc")}</p>
                        </>
                    ) : (
                        <>
                            <Clock className="h-14 w-14 text-amber-400 mx-auto mb-3" />
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("pending_heading")}</h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("pending_desc")}</p>
                        </>
                    )}
                </div>

                {/* Booking details */}
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">{t("court")}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{court?.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">{t("date")}</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                            {format(new Date(booking.date), "PPP")}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">{t("time")}</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                            {booking.start_time.slice(0, 5)} – {booking.end_time.slice(0, 5)}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">{t("players")}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{booking.num_players}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">{t("total")}</span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                            {booking.total_price} {booking.currency}
                        </span>
                    </div>
                    {facility && (
                        <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
                            <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>{facility.name} — {facility.address}, {facility.city}</span>
                        </div>
                    )}
                </div>

                {/* Complete Payment — pending bookings */}
                {isPending && <CompletePaymentButton bookingId={booking.id} />}

                {/* QR Code — only for confirmed bookings */}
                {isConfirmed && !isCancelled && booking.qr_code_token && (
                    <BookingQRCode token={booking.qr_code_token} appUrl={appUrl} />
                )}

                {/* Share actions — only for confirmed bookings */}
                {isConfirmed && !isCancelled && (
                    <BookingShareActions
                        courtName={court?.name ?? ""}
                        facilityName={facility?.name ?? ""}
                        date={booking.date}
                        startTime={booking.start_time}
                        endTime={booking.end_time}
                        address={`${facility?.address ?? ""}, ${facility?.city ?? ""}`}
                        totalPrice={booking.total_price}
                        currency={booking.currency}
                        numPlayers={booking.num_players}
                        shareUrl={shareUrl}
                    />
                )}

                {(isConfirmed || booking.status === "completed") && (
                    <Link
                        href={`/${locale}/bookings/${booking.id}/invoice`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        Download invoice
                    </Link>
                )}

                <div className="flex gap-3">
                    <Link
                        href={`/${locale}/map`}
                        className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        {t("find_courts")}
                    </Link>
                    <Link
                        href={`/${locale}/bookings`}
                        className="flex-1 px-4 py-2.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium text-center hover:opacity-90 transition-opacity"
                    >
                        {t("my_bookings")}
                    </Link>
                </div>
            </div>
        </div>
    );
}
