import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { format } from "date-fns";
import { CheckCircle2, Clock, Users, QrCode } from "lucide-react";
import { CheckInButton } from "./CheckInButton";
import { QrScannerModal } from "./QrScannerModal";
import { getActiveFacility } from "@/lib/facility-context";

export const metadata = { title: "Check-in – Saha" };

export default async function CheckInPage() {
    const supabase = await createClient();
    const locale = await getLocale();
    const t = await getTranslations("checkin_page");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const facility = await getActiveFacility(supabase, user.id);
    if (!facility) redirect(`/${locale}/dashboard`);

    const today = new Date().toISOString().split("T")[0];

    const { data: bookings } = await supabase
        .from("bookings")
        .select(`
            id, date, start_time, end_time, status, num_players, qr_code_token,
            courts(name),
            profiles(display_name)
        `)
        .eq("courts.facility_id", facility.id)
        .eq("date", today)
        .in("status", ["confirmed", "completed"])
        .order("start_time", { ascending: true });

    const courts = [...new Set((bookings ?? []).map((b) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (b as any).courts?.name as string;
    }).filter(Boolean))].sort();

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("heading")}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {t("today_subtitle", { date: format(new Date(today), "EEEE, MMMM d") })}
                    </p>
                </div>
                <QrScannerModal />
            </div>

            {!bookings?.length ? (
                <div className="text-center py-16 space-y-2">
                    <QrCode className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto" />
                    <p className="text-gray-500 dark:text-gray-400">{t("no_bookings")}</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {courts.map((courtName) => {
                        const courtBookings = (bookings ?? []).filter((b) => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            return (b as any).courts?.name === courtName;
                        });

                        return (
                            <div key={courtName}>
                                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                                    {courtName}
                                </h2>
                                <div className="space-y-3">
                                    {courtBookings.map((booking) => {
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        const player = (booking as any).profiles;
                                        const isCheckedIn = booking.status === "completed";

                                        return (
                                            <div
                                                key={booking.id}
                                                className={`bg-white dark:bg-gray-900 border rounded-xl p-4 flex items-center gap-4 ${
                                                    isCheckedIn
                                                        ? "border-emerald-200 dark:border-emerald-800 opacity-60"
                                                        : "border-gray-200 dark:border-gray-800"
                                                }`}
                                            >
                                                {/* Time */}
                                                <div className="flex flex-col items-center w-14 shrink-0">
                                                    <Clock className="h-4 w-4 text-gray-400 mb-1" />
                                                    <span className="text-xs font-medium text-gray-900 dark:text-white">
                                                        {booking.start_time.slice(0, 5)}
                                                    </span>
                                                    <span className="text-xs text-gray-400">
                                                        {booking.end_time.slice(0, 5)}
                                                    </span>
                                                </div>

                                                {/* Player info */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                                        {player?.display_name ?? t("player_fallback")}
                                                    </p>
                                                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                        <Users className="h-3 w-3" />
                                                        <span>{t("num_players", { n: booking.num_players })}</span>
                                                    </div>
                                                </div>

                                                {/* Status / Check-in button */}
                                                {isCheckedIn ? (
                                                    <div className="flex items-center gap-1.5 text-emerald-500 text-sm font-medium">
                                                        <CheckCircle2 className="h-5 w-5" />
                                                        <span className="hidden sm:block">{t("checked_in_label")}</span>
                                                    </div>
                                                ) : (
                                                    <CheckInButton bookingId={booking.id} />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
