import { createClient } from "@/lib/supabase/server";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { CalendarDays, TrendingUp, CheckCircle, AlertCircle } from "lucide-react";
import { ExportButton } from "./ExportButton";
import { OwnerCancelButton } from "./OwnerCancelButton";
import { getActiveFacility } from "@/lib/facility-context";
import { formatPrice } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Bookings & Revenue – Saha" };

const STATUS_STYLES: Record<string, string> = {
    confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    no_show: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export default async function OwnerBookingsPage() {
    const supabase = await createClient();
    const locale = await getLocale();
    const t = await getTranslations("dashboard.bookings");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const facility = await getActiveFacility(supabase, user.id);
    if (!facility) redirect(`/${locale}/dashboard/onboarding`);

    // Get all court IDs for this facility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: courts } = await (supabase as any)
        .from("courts")
        .select("id, name")
        .eq("facility_id", facility.id);

    const courtIds: string[] = (courts ?? []).map((c: { id: string }) => c.id);
    const courtMap: Record<string, string> = Object.fromEntries(
        (courts ?? []).map((c: { id: string; name: string }) => [c.id, c.name])
    );

    const today = new Date().toISOString().slice(0, 10);

    // Week range (Mon–Sun)
    const now = new Date();
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek);
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    // Month range
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

    // Upcoming: today + next 30 days
    const futureEnd = new Date(now);
    futureEnd.setDate(now.getDate() + 30);
    const futureEndStr = futureEnd.toISOString().slice(0, 10);

    if (courtIds.length === 0) {
        return (
            <div className="max-w-4xl space-y-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">No courts set up yet.</p>
            </div>
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [{ data: todayBookings }, { data: upcomingBookings }, { data: revenueWeek }, { data: revenueMonth }] = await Promise.all([
        // Today
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
            .from("bookings")
            .select("id, court_id, date, start_time, end_time, num_players, total_price, status, profiles(display_name)")
            .in("court_id", courtIds)
            .eq("date", today)
            .order("start_time"),
        // Upcoming (today + 30 days, confirmed/pending only)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
            .from("bookings")
            .select("id, court_id, date, start_time, end_time, num_players, total_price, status, profiles(display_name)")
            .in("court_id", courtIds)
            .gte("date", today)
            .lte("date", futureEndStr)
            .in("status", ["confirmed", "pending"])
            .order("date")
            .order("start_time")
            .limit(50),
        // Revenue this week
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
            .from("bookings")
            .select("total_price")
            .in("court_id", courtIds)
            .gte("date", weekStartStr)
            .lte("date", today)
            .in("status", ["confirmed", "completed"]),
        // Revenue this month
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
            .from("bookings")
            .select("total_price")
            .in("court_id", courtIds)
            .gte("date", monthStart)
            .lte("date", today)
            .in("status", ["confirmed", "completed"]),
    ]);

    const weekRevenue = (revenueWeek ?? []).reduce((sum: number, b: { total_price: number }) => sum + Number(b.total_price), 0);
    const monthRevenue = (revenueMonth ?? []).reduce((sum: number, b: { total_price: number }) => sum + Number(b.total_price), 0);
    const todayCount = (todayBookings ?? []).length;
    const upcomingCount = (upcomingBookings ?? []).length;

    return (
        <div className="max-w-4xl space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
                <ExportButton />
            </div>

            {/* Stripe status */}
            <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg ${facility.stripe_account_id ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400" : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"}`}>
                {facility.stripe_account_id
                    ? <><CheckCircle className="h-4 w-4 shrink-0" /><span>{t("stripe_connected")}</span></>
                    : <><AlertCircle className="h-4 w-4 shrink-0" /><span>{t("stripe_not_connected")}</span></>
                }
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: t("today"), value: todayCount, icon: CalendarDays, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20" },
                    { label: t("upcoming"), value: upcomingCount, icon: CalendarDays, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/20" },
                    { label: t("revenue_week"), value: formatPrice(weekRevenue, facility.currency, locale), icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
                    { label: t("revenue_month"), value: formatPrice(monthRevenue, facility.currency, locale), icon: TrendingUp, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-900/20" },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
                        <div className={`inline-flex p-2 rounded-lg ${bg}`}>
                            <Icon className={`h-4 w-4 ${color}`} />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Today's bookings */}
            <section>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">{t("today")}</h2>
                {(todayBookings ?? []).length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("no_today")}</p>
                ) : (
                    <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400">
                                <tr>
                                    <th className="text-start px-4 py-3 font-medium">{t("time_label")}</th>
                                    <th className="text-start px-4 py-3 font-medium">{t("court_label")}</th>
                                    <th className="text-start px-4 py-3 font-medium">{t("player_label")}</th>
                                    <th className="text-start px-4 py-3 font-medium">{t("amount_label")}</th>
                                    <th className="text-start px-4 py-3 font-medium">{t("status_label")}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {(todayBookings ?? []).map((b: {
                                    id: string; court_id: string; start_time: string; end_time: string;
                                    total_price: number; status: string; profiles: { display_name: string } | null;
                                }) => (
                                    <tr key={b.id} className="bg-white dark:bg-gray-900">
                                        <td className="px-4 py-3 tabular-nums text-gray-900 dark:text-white">
                                            {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{courtMap[b.court_id] ?? "—"}</td>
                                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{b.profiles?.display_name ?? "—"}</td>
                                        <td className="px-4 py-3 tabular-nums text-gray-900 dark:text-white">{formatPrice(Number(b.total_price), facility.currency, locale)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[b.status] ?? ""}`}>
                                                {b.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Upcoming bookings */}
            <section>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">{t("upcoming")}</h2>
                {(upcomingBookings ?? []).length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("no_upcoming")}</p>
                ) : (
                    <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400">
                                <tr>
                                    <th className="text-start px-4 py-3 font-medium">{t("date_label")}</th>
                                    <th className="text-start px-4 py-3 font-medium">{t("time_label")}</th>
                                    <th className="text-start px-4 py-3 font-medium">{t("court_label")}</th>
                                    <th className="text-start px-4 py-3 font-medium">{t("player_label")}</th>
                                    <th className="text-start px-4 py-3 font-medium">{t("amount_label")}</th>
                                    <th className="text-start px-4 py-3 font-medium">{t("status_label")}</th>
                                    <th className="px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {(upcomingBookings ?? []).map((b: {
                                    id: string; court_id: string; date: string; start_time: string;
                                    end_time: string; total_price: number; status: string;
                                    profiles: { display_name: string } | null;
                                }) => (
                                    <tr key={b.id} className="bg-white dark:bg-gray-900">
                                        <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-gray-300">{b.date}</td>
                                        <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-gray-300">
                                            {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{courtMap[b.court_id] ?? "—"}</td>
                                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{b.profiles?.display_name ?? "—"}</td>
                                        <td className="px-4 py-3 tabular-nums text-gray-900 dark:text-white">{formatPrice(Number(b.total_price), facility.currency, locale)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[b.status] ?? ""}`}>
                                                {b.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-end">
                                            {["confirmed", "pending"].includes(b.status) && (
                                                <OwnerCancelButton bookingId={b.id} />
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
