/**
 * SAH-126 Stage A: full booking history for the active facility.
 *
 * /dashboard/bookings shows today + the next 30 days of upcoming bookings.
 * This page is the catch-all — every booking on every court of the active
 * facility, filterable by status + date range + player name, paginated
 * 50 per page.
 *
 * Stage B (separate commit) adds a PDF report download from this page.
 */

import { createClient } from "@/lib/supabase/server";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ExportButton } from "../ExportButton";
import { getActiveFacility } from "@/lib/facility-context";
import { formatPrice } from "@/lib/utils";
import { format } from "date-fns";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Booking history – Saha" };

const PAGE_SIZE = 50;

const STATUS_STYLES: Record<string, string> = {
    confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    no_show: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

interface Search {
    page?: string;
    status?: string;
    from?: string;
    to?: string;
    q?: string;
}

export default async function BookingHistoryPage({
    searchParams,
}: {
    searchParams: Promise<Search>;
}) {
    const params = await searchParams;
    const supabase = await createClient();
    const locale = await getLocale();
    const t = await getTranslations("dashboard.bookings_history");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const facility = await getActiveFacility(supabase, user.id);
    if (!facility) redirect(`/${locale}/dashboard/onboarding`);

    // Court ids for this facility — RLS restricts visible courts already,
    // but we filter explicitly so pagination math is right.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: courts } = await (supabase as any)
        .from("courts")
        .select("id, name")
        .eq("facility_id", facility.id);
    const courtIds: string[] = (courts ?? []).map((c: { id: string }) => c.id);
    const courtMap: Record<string, string> = Object.fromEntries(
        (courts ?? []).map((c: { id: string; name: string }) => [c.id, c.name])
    );

    if (courtIds.length === 0) {
        return (
            <div className="max-w-5xl space-y-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t("no_courts")}</p>
            </div>
        );
    }

    const page = Math.max(1, Number(params.page ?? "1"));
    const offset = (page - 1) * PAGE_SIZE;

    // Build the query with filters. The `count: 'exact'` lets us paginate.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
        .from("bookings")
        .select(
            "id, court_id, player_id, date, start_time, end_time, num_players, total_price, currency, status, profiles(display_name)",
            { count: "exact" }
        )
        .in("court_id", courtIds);

    if (params.status && params.status !== "all") {
        query = query.eq("status", params.status);
    }
    if (params.from) query = query.gte("date", params.from);
    if (params.to) query = query.lte("date", params.to);
    if (params.q) {
        // Filter by player display name via the embedded relation.
        // PostgREST's `.ilike` on an embedded column doesn't filter the parent
        // rows, so we fetch player ids matching the query first.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: matches } = await (supabase as any)
            .from("profiles").select("id").ilike("display_name", `%${params.q}%`).limit(200);
        const ids = (matches ?? []).map((p: { id: string }) => p.id);
        if (ids.length === 0) {
            // No match — short-circuit to empty result.
            return renderPage({ rows: [], total: 0, page, params, courtMap, t, locale, currency: facility.currency, locale_link: locale });
        }
        query = query.in("player_id", ids);
    }

    query = query.order("date", { ascending: false }).order("start_time", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);

    const { data: rows, count } = await query;
    return renderPage({
        rows: rows ?? [],
        total: count ?? 0,
        page,
        params,
        courtMap,
        t,
        locale,
        currency: facility.currency,
        locale_link: locale,
    });
}

interface BookingRow {
    id: string;
    court_id: string;
    date: string;
    start_time: string;
    end_time: string;
    num_players: number;
    total_price: number;
    currency: string | null;
    status: string;
    profiles: { display_name: string } | null;
}

function renderPage({
    rows,
    total,
    page,
    params,
    courtMap,
    t,
    locale,
    currency,
    locale_link,
}: {
    rows: BookingRow[];
    total: number;
    page: number;
    params: Search;
    courtMap: Record<string, string>;
    t: (key: string) => string;
    locale: string;
    currency: string | null;
    locale_link: string;
}) {
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const baseQuery = new URLSearchParams();
    if (params.status) baseQuery.set("status", params.status);
    if (params.from) baseQuery.set("from", params.from);
    if (params.to) baseQuery.set("to", params.to);
    if (params.q) baseQuery.set("q", params.q);

    const linkFor = (p: number) => {
        const q = new URLSearchParams(baseQuery);
        q.set("page", String(p));
        return `?${q.toString()}`;
    };

    return (
        <div className="max-w-6xl space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <Link
                        href={`/${locale_link}/dashboard/bookings`}
                        className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 mb-2"
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        {t("back_to_bookings")}
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {t("subtitle")} · {total} {t("total")}
                    </p>
                </div>
                <ExportButton />
            </div>

            {/* Filters */}
            <form method="GET" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
                <label className="text-sm">
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t("filter_status")}</span>
                    <select
                        name="status"
                        defaultValue={params.status ?? "all"}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                    >
                        <option value="all">{t("filter_status_all")}</option>
                        <option value="pending">{t("status_pending")}</option>
                        <option value="confirmed">{t("status_confirmed")}</option>
                        <option value="completed">{t("status_completed")}</option>
                        <option value="cancelled">{t("status_cancelled")}</option>
                        <option value="no_show">{t("status_no_show")}</option>
                    </select>
                </label>
                <label className="text-sm">
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t("filter_from")}</span>
                    <input
                        type="date"
                        name="from"
                        defaultValue={params.from ?? ""}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                    />
                </label>
                <label className="text-sm">
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t("filter_to")}</span>
                    <input
                        type="date"
                        name="to"
                        defaultValue={params.to ?? ""}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                    />
                </label>
                <label className="text-sm sm:col-span-2 md:col-span-1">
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t("filter_player")}</span>
                    <input
                        type="text"
                        name="q"
                        defaultValue={params.q ?? ""}
                        placeholder={t("filter_player_placeholder")}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                    />
                </label>
                <button
                    type="submit"
                    className="bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-emerald-700"
                >
                    {t("filter_apply")}
                </button>
            </form>

            {/* Table */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            <tr>
                                <th className="px-4 py-3 text-left">{t("col_date")}</th>
                                <th className="px-4 py-3 text-left">{t("col_time")}</th>
                                <th className="px-4 py-3 text-left">{t("col_court")}</th>
                                <th className="px-4 py-3 text-left">{t("col_player")}</th>
                                <th className="px-4 py-3 text-left">{t("col_status")}</th>
                                <th className="px-4 py-3 text-right">{t("col_amount")}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {rows.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                                        {t("empty")}
                                    </td>
                                </tr>
                            ) : (
                                rows.map((b) => (
                                    <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                                        <td className="px-4 py-3 whitespace-nowrap">{format(new Date(b.date), "PP")}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">
                                            {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}
                                        </td>
                                        <td className="px-4 py-3">{courtMap[b.court_id] ?? "—"}</td>
                                        <td className="px-4 py-3">{b.profiles?.display_name ?? "—"}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[b.status] ?? STATUS_STYLES.pending}`}>
                                                {b.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums">
                                            {formatPrice(Number(b.total_price), b.currency ?? currency ?? "AED", locale)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm">
                    <p className="text-gray-500 dark:text-gray-400">
                        {t("page_of")} {page} / {totalPages}
                    </p>
                    <div className="flex gap-2">
                        {page > 1 && (
                            <Link
                                href={linkFor(page - 1)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                                {t("prev")}
                            </Link>
                        )}
                        {page < totalPages && (
                            <Link
                                href={linkFor(page + 1)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                {t("next")}
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
