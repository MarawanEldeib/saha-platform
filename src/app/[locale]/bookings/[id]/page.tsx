import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { format } from "date-fns";
import { CheckCircle, XCircle, Clock, MapPin } from "lucide-react";
import Link from "next/link";

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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const { data: booking } = await supabase
        .from("bookings")
        .select(`
            id, date, start_time, end_time, status, total_price, currency, qr_code_token,
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

    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
            <div className="max-w-md w-full space-y-6">
                {/* Status header */}
                <div className="text-center">
                    {isConfirmed && !isCancelled ? (
                        <>
                            <CheckCircle className="h-14 w-14 text-emerald-500 mx-auto mb-3" />
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Booking Confirmed</h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Your court is reserved. See you there!</p>
                        </>
                    ) : isCancelled ? (
                        <>
                            <XCircle className="h-14 w-14 text-red-400 mx-auto mb-3" />
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Booking Cancelled</h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Payment was not completed. The slot has been released.</p>
                        </>
                    ) : (
                        <>
                            <Clock className="h-14 w-14 text-amber-400 mx-auto mb-3" />
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Awaiting Payment</h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Complete your payment to confirm this booking.</p>
                        </>
                    )}
                </div>

                {/* Booking details */}
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Court</span>
                        <span className="font-medium text-gray-900 dark:text-white">{court?.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Date</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                            {format(new Date(booking.date), "PPP")}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Time</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                            {booking.start_time.slice(0, 5)} – {booking.end_time.slice(0, 5)}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Total</span>
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

                <div className="flex gap-3">
                    <Link
                        href={`/${locale}/map`}
                        className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        Find more courts
                    </Link>
                    <Link
                        href={`/${locale}/dashboard`}
                        className="flex-1 px-4 py-2.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium text-center hover:opacity-90 transition-opacity"
                    >
                        My bookings
                    </Link>
                </div>
            </div>
        </div>
    );
}
