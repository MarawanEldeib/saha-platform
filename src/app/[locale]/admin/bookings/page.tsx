import { createClient } from "@/lib/supabase/server";
import { ADMIN_PAGE_SIZE } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import Link from "next/link";
import { format } from "date-fns";
import { CalendarDays, ExternalLink, Filter } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin · All Bookings — Saha" };

const STATUS_STYLES: Record<string, string> = {
    confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    no_show: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const PAGE_SIZE = ADMIN_PAGE_SIZE;

type SearchParams = {
    status?: string;
    from?: string;
    to?: string;
    page?: string;
};

export default async function AdminBookingsPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const supabase = await createClient();
    const locale = await getLocale();

    // Layout already enforces admin role, but defense in depth.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const { status, from, to, page: pageParam } = await searchParams;
    const page = Math.max(1, Number(pageParam) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    // Use the admin client so we see every booking regardless of RLS scope.
    const admin = createAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = admin
        .from("bookings")
        .select(
            "id, date, start_time, end_time, status, total_price, currency, courts(name, facilities(name, city)), profiles(display_name)",
            { count: "exact" },
        );

    if (status && status !== "all") {
        query = query.eq("status", status);
    }
    if (from) query = query.gte("date", from);
    if (to) query = query.lte("date", to);

    query = query
        .order("date", { ascending: false })
        .order("start_time", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

    const { data: rows, count } = await query;

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const buildLink = (overrides: Partial<SearchParams>) => {
        const next = new URLSearchParams();
        if ((overrides.status ?? status) && (overrides.status ?? status) !== "all") {
            next.set("status", overrides.status ?? status!);
        }
        if (overrides.from ?? from) next.set("from", overrides.from ?? from!);
        if (overrides.to ?? to) next.set("to", overrides.to ?? to!);
        const p = overrides.page ?? String(page);
        if (p && p !== "1") next.set("page", p);
        const qs = next.toString();
        return `/${locale}/admin/bookings${qs ? `?${qs}` : ""}`;
    };

    const STATUSES = ["all", "pending", "confirmed", "completed", "cancelled", "no_show"] as const;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-emerald-500" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">All bookings</h1>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                    {total.toLocaleString()} total
                </span>
            </div>

            {/* Filters */}
            <form
                method="GET"
                className="flex flex-wrap items-end gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4"
            >
                <div className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                    <Filter className="h-4 w-4" />
                    Filters
                </div>
                <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Status</span>
                    <select
                        name="status"
                        defaultValue={status ?? "all"}
                        className="text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800"
                    >
                        {STATUSES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">From</span>
                    <input
                        type="date"
                        name="from"
                        defaultValue={from}
                        className="text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800"
                    />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">To</span>
                    <input
                        type="date"
                        name="to"
                        defaultValue={to}
                        className="text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800"
                    />
                </label>
                <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:opacity-90"
                >
                    Apply
                </button>
                <Link
                    href={`/${locale}/admin/bookings`}
                    className="px-4 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                    Clear
                </Link>
            </form>

            {/* Table */}
            {!rows || rows.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                    No bookings match these filters.
                </p>
            ) : (
                <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400">
                            <tr>
                                <th className="text-start px-4 py-3 font-medium">When</th>
                                <th className="text-start px-4 py-3 font-medium">Facility / court</th>
                                <th className="text-start px-4 py-3 font-medium">Player</th>
                                <th className="text-start px-4 py-3 font-medium">Amount</th>
                                <th className="text-start px-4 py-3 font-medium">Status</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {(rows as any[]).map((b) => (
                                <tr key={b.id} className="bg-white dark:bg-gray-900">
                                    <td className="px-4 py-3 tabular-nums text-gray-900 dark:text-white">
                                        {format(new Date(b.date), "MMM d")} · {b.start_time.slice(0, 5)}
                                    </td>
                                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                                        <div className="font-medium">{b.courts?.facilities?.name ?? "—"}</div>
                                        <div className="text-xs text-gray-500">
                                            {b.courts?.name ?? "—"} · {b.courts?.facilities?.city ?? ""}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                                        {b.profiles?.display_name ?? "—"}
                                    </td>
                                    <td className="px-4 py-3 tabular-nums">
                                        {formatPrice(Number(b.total_price), b.currency ?? "AED", locale)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[b.status] ?? ""}`}>
                                            {b.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-end">
                                        <Link
                                            href={`/${locale}/admin/bookings/${b.id}`}
                                            className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                                        >
                                            View <ExternalLink className="h-3 w-3" />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">
                        Page {page} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                        {page > 1 && (
                            <Link
                                href={buildLink({ page: String(page - 1) })}
                                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                Previous
                            </Link>
                        )}
                        {page < totalPages && (
                            <Link
                                href={buildLink({ page: String(page + 1) })}
                                className="px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                            >
                                Next
                            </Link>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
