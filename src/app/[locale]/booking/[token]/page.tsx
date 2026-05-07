import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { MapPin, Clock, Users, Calendar } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ token: string }>;
}): Promise<Metadata> {
    const { token } = await params;
    const supabase = createAdminClient();
    const { data } = await supabase
        .from("bookings")
        .select("date, courts(name, facilities(name))")
        .eq("qr_code_token", token)
        .single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const court = (data as any)?.courts;
    const facility = court?.facilities;
    return {
        title: data ? `${court?.name} @ ${facility?.name} – Saha` : "Booking – Saha",
    };
}

export default async function ShareableBookingPage({
    params,
}: {
    params: Promise<{ locale: string; token: string }>;
}) {
    const { token, locale } = await params;
    const supabase = createAdminClient();

    const { data: booking } = await supabase
        .from("bookings")
        .select(`
            id, date, start_time, end_time, num_players, status,
            courts(name, sport_id, facilities(name, address, city, phone))
        `)
        .eq("qr_code_token", token)
        .single();

    if (!booking || booking.status === "cancelled") notFound();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const court = (booking as any).courts;
    const facility = court?.facilities;

    const gcalParams = new URLSearchParams({
        action: "TEMPLATE",
        text: `${court?.name} @ ${facility?.name}`,
        dates: `${booking.date.replace(/-/g, "")}T${booking.start_time.replace(/:/g, "").slice(0, 6)}00/${booking.date.replace(/-/g, "")}T${booking.end_time.replace(/:/g, "").slice(0, 6)}00`,
        location: `${facility?.address ?? ""}, ${facility?.city ?? ""}`,
    });

    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
            <div className="max-w-sm w-full space-y-6">
                {/* Header */}
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mb-3">
                        <Calendar className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">You&apos;re invited!</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Join a court booking at {facility?.name}
                    </p>
                </div>

                {/* Booking details */}
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-800">
                    <div className="flex items-center gap-3 px-5 py-4">
                        <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
                            <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Date & Time</p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                {format(new Date(booking.date), "EEEE, MMMM d, yyyy")}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {booking.start_time.slice(0, 5)} – {booking.end_time.slice(0, 5)}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 px-5 py-4">
                        <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
                            <MapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Location</p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{facility?.name}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {facility?.address}, {facility?.city}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 px-5 py-4">
                        <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
                            <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Court & Players</p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{court?.name}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{booking.num_players} players</p>
                        </div>
                    </div>
                </div>

                {/* Add to Calendar */}
                <div className="space-y-2">
                    <a
                        href={`https://calendar.google.com/calendar/render?${gcalParams}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        <Calendar className="h-4 w-4" />
                        Add to Google Calendar
                    </a>
                </div>

                {/* CTA for non-users */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 text-center space-y-2">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Want to book your own court?</p>
                    <Link
                        href={`/${locale}/map`}
                        className="inline-block px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                        Find courts on Saha
                    </Link>
                </div>
            </div>
        </div>
    );
}
