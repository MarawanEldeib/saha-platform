import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import Link from "next/link";
import { format } from "date-fns";
import { DollarSign, TrendingUp, AlertTriangle, RefreshCw, Filter, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { getPlatformFeePercent } from "@/lib/platform-settings";

export const metadata: Metadata = { title: "Admin · Finance — Saha" };

const aedFmt = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 });
const aedFmt2 = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 2 });

type SearchParams = { from?: string; to?: string };

interface BookingRow {
    date: string;
    total_price: string | number;
    status: string;
    courts: { facility_id: string; facilities: { id: string; name: string; city: string; stripe_account_id: string | null } | null } | null;
}

interface FacilityAgg {
    id: string;
    name: string;
    city: string;
    stripe_account_id: string | null;
    bookings: number;
    gross: number;
    fees: number;
}

function isoDate(d: Date) {
    return d.toISOString().slice(0, 10);
}

export default async function AdminFinancePage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const supabase = await createClient();
    const locale = await getLocale();

    // Defense in depth.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);
    const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single();
    if ((profile as { role: string } | null)?.role !== "admin") redirect(`/${locale}`);

    const platformFeePercent = await getPlatformFeePercent();
    const sp = await searchParams;
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 90 * 86_400_000);
    const from = sp.from ?? isoDate(defaultFrom);
    const to = sp.to ?? isoDate(now);

    const thirtyDaysAgo = isoDate(new Date(now.getTime() - 30 * 86_400_000));
    const todayStr = isoDate(now);

    const admin = createAdminClient();

    // Parallel aggregations. We fetch booking rows in the range for the
    // per-facility breakdown and daily chart, then derive everything from
    // the same array — cheaper than re-querying for each KPI.
    const [
        { count: lifetimeBookings },
        { count: bookings30d },
        { data: lifetimeRevenueRows },
        { data: revenue30dRows },
        { data: rangeBookingRows },
        { count: openDisputes30d },
        { data: openDisputesData },
        { count: refundedLast30 },
    ] = await Promise.all([
        admin.from("bookings").select("*", { count: "exact", head: true }).in("status", ["confirmed", "completed"]),
        admin.from("bookings").select("*", { count: "exact", head: true })
            .gte("date", thirtyDaysAgo)
            .lte("date", todayStr)
            .in("status", ["confirmed", "completed"]),
        admin.from("bookings").select("total_price").in("status", ["confirmed", "completed"]),
        admin.from("bookings").select("total_price")
            .gte("date", thirtyDaysAgo)
            .lte("date", todayStr)
            .in("status", ["confirmed", "completed"]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin as any).from("bookings")
            .select("date, total_price, status, courts(facility_id, facilities(id, name, city, stripe_account_id))")
            .gte("date", from)
            .lte("date", to)
            .in("status", ["confirmed", "completed"]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin as any).from("audit_log").select("*", { count: "exact", head: true })
            .eq("action", "stripe.dispute.created")
            .gte("created_at", thirtyDaysAgo),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin as any).from("audit_log")
            .select("metadata, created_at")
            .eq("action", "stripe.dispute.created")
            .gte("created_at", thirtyDaysAgo),
        admin.from("payments").select("*", { count: "exact", head: true })
            .eq("status", "refunded")
            .gte("created_at", thirtyDaysAgo),
    ]);

    const lifetimeGross = (lifetimeRevenueRows ?? []).reduce(
        (sum, r) => sum + Number((r as { total_price: number | string }).total_price ?? 0), 0);
    const gross30d = (revenue30dRows ?? []).reduce(
        (sum, r) => sum + Number((r as { total_price: number | string }).total_price ?? 0), 0);
    const lifetimeFees = lifetimeGross * (platformFeePercent / 100);
    const fees30d = gross30d * (platformFeePercent / 100);

    // Total dispute amount at risk (sum metadata.amount, which is in cents from Stripe).
    const disputeRows = (openDisputesData ?? []) as Array<{ metadata: { amount?: number; currency?: string } | null }>;
    const disputeAmount = disputeRows.reduce((s, r) => s + (Number(r.metadata?.amount ?? 0) / 100), 0);

    // Per-facility aggregation from the range bookings.
    const facilityMap = new Map<string, FacilityAgg>();
    const dailyTotals = new Map<string, number>(); // ISO date → gross
    for (const r of (rangeBookingRows ?? []) as BookingRow[]) {
        const fac = r.courts?.facilities;
        if (fac) {
            const existing = facilityMap.get(fac.id) ?? {
                id: fac.id,
                name: fac.name,
                city: fac.city,
                stripe_account_id: fac.stripe_account_id,
                bookings: 0,
                gross: 0,
                fees: 0,
            };
            const amount = Number(r.total_price ?? 0);
            existing.bookings += 1;
            existing.gross += amount;
            existing.fees += amount * (platformFeePercent / 100);
            facilityMap.set(fac.id, existing);
        }
        const amount = Number(r.total_price ?? 0);
        dailyTotals.set(r.date, (dailyTotals.get(r.date) ?? 0) + amount);
    }
    const facilityRows = [...facilityMap.values()].sort((a, b) => b.gross - a.gross);

    // Build the daily series with zero-fill for missing days.
    const fromDate = new Date(from + "T00:00:00Z");
    const toDate = new Date(to + "T00:00:00Z");
    const days: Array<{ date: string; gross: number }> = [];
    for (let d = new Date(fromDate); d <= toDate; d = new Date(d.getTime() + 86_400_000)) {
        const key = isoDate(d);
        days.push({ date: key, gross: dailyTotals.get(key) ?? 0 });
    }
    const maxGross = Math.max(1, ...days.map((d) => d.gross));

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-emerald-500" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Finance</h1>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                    Platform fee: {platformFeePercent}%
                </span>
            </div>

            {/* Range filter */}
            <form
                method="GET"
                className="flex flex-wrap items-end gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4"
            >
                <div className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                    <Filter className="h-4 w-4" /> Range
                </div>
                <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">From</span>
                    <input
                        type="date" name="from" defaultValue={from}
                        className="text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800"
                    />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">To</span>
                    <input
                        type="date" name="to" defaultValue={to}
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
                    href={`/${locale}/admin/finance`}
                    className="px-4 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                    Reset
                </Link>
                <span className="text-xs text-gray-500 dark:text-gray-400 ms-auto">
                    Range covers {days.length} days
                </span>
            </form>

            {/* KPI strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard
                    label="Total bookings"
                    value={(lifetimeBookings ?? 0).toLocaleString()}
                    sub={`${(bookings30d ?? 0).toLocaleString()} in last 30d`}
                    icon={<TrendingUp className="h-4 w-4" />}
                />
                <KpiCard
                    label="Gross revenue"
                    value={aedFmt.format(lifetimeGross)}
                    sub={`${aedFmt.format(gross30d)} in last 30d`}
                    icon={<DollarSign className="h-4 w-4" />}
                />
                <KpiCard
                    label={`Platform fees (${platformFeePercent}%)`}
                    value={aedFmt.format(lifetimeFees)}
                    sub={`${aedFmt.format(fees30d)} in last 30d`}
                    icon={<DollarSign className="h-4 w-4" />}
                />
                <KpiCard
                    label="Refunded (30d)"
                    value={(refundedLast30 ?? 0).toLocaleString()}
                    sub="payment rows in 'refunded'"
                    icon={<RefreshCw className="h-4 w-4" />}
                />
            </div>

            {/* Dispute alert */}
            {(openDisputes30d ?? 0) > 0 && (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 text-red-600 shrink-0" />
                    <div>
                        <div className="font-medium text-red-700 dark:text-red-400">
                            {openDisputes30d} dispute{openDisputes30d === 1 ? "" : "s"} opened in the last 30 days
                        </div>
                        <div className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">
                            Total at risk: {aedFmt2.format(disputeAmount)}. Review in Stripe Dashboard.
                        </div>
                    </div>
                </div>
            )}

            {/* Daily revenue chart */}
            <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-500" /> Daily gross — {format(fromDate, "MMM d")} → {format(toDate, "MMM d")}
                </h2>
                {days.length === 0 || maxGross === 1 && days.every((d) => d.gross === 0) ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">No revenue in this range.</p>
                ) : (
                    <div className="flex items-end gap-0.5 h-32" role="img" aria-label="Daily gross revenue bar chart">
                        {days.map((d) => {
                            const heightPct = (d.gross / maxGross) * 100;
                            return (
                                <div
                                    key={d.date}
                                    title={`${d.date}: ${aedFmt.format(d.gross)}`}
                                    className="flex-1 min-w-[2px] bg-emerald-200 dark:bg-emerald-900/40 hover:bg-emerald-400 dark:hover:bg-emerald-600 transition-colors rounded-sm"
                                    style={{ height: `${Math.max(heightPct, 1)}%` }}
                                />
                            );
                        })}
                    </div>
                )}
                <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 mt-2 tabular-nums">
                    <span>0</span>
                    <span>Max: {aedFmt.format(maxGross)}</span>
                </div>
            </section>

            {/* Per-facility breakdown */}
            <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white px-5 pt-5 pb-3">
                    Per-facility breakdown
                </h2>
                {facilityRows.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic px-5 pb-5">No facility activity in this range.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400">
                                <tr>
                                    <th className="text-start px-4 py-3 font-medium">Facility</th>
                                    <th className="text-start px-4 py-3 font-medium">Bookings</th>
                                    <th className="text-start px-4 py-3 font-medium">Gross</th>
                                    <th className="text-start px-4 py-3 font-medium">Platform fee</th>
                                    <th className="text-start px-4 py-3 font-medium">Stripe</th>
                                    <th className="px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {facilityRows.map((f) => (
                                    <tr key={f.id} className="bg-white dark:bg-gray-900">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900 dark:text-white">{f.name}</div>
                                            <div className="text-xs text-gray-500">{f.city}</div>
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-gray-300">{f.bookings}</td>
                                        <td className="px-4 py-3 tabular-nums text-gray-900 dark:text-white">
                                            {aedFmt.format(f.gross)}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-emerald-700 dark:text-emerald-400">
                                            {aedFmt.format(f.fees)}
                                        </td>
                                        <td className="px-4 py-3">
                                            {f.stripe_account_id ? (
                                                <span className="text-[10px] font-mono text-gray-600 dark:text-gray-400">
                                                    {f.stripe_account_id.slice(0, 12)}…
                                                </span>
                                            ) : (
                                                <span className="text-xs text-amber-700 dark:text-amber-400">not connected</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-end whitespace-nowrap">
                                            <Link
                                                href={`/${locale}/admin/facilities/${f.id}/diagnostics`}
                                                className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                                            >
                                                Diagnostics
                                            </Link>
                                            {f.stripe_account_id && (
                                                <a
                                                    href={`https://dashboard.stripe.com/connect/accounts/${f.stripe_account_id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline ms-3"
                                                >
                                                    Stripe <ExternalLink className="h-3 w-3" />
                                                </a>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <p className="text-xs text-gray-400 dark:text-gray-600">
                Live Stripe payout list is intentionally not pulled here — paginating per connected account
                on every render is expensive. Use the per-row &quot;Stripe&quot; link to drill in.
            </p>
        </div>
    );
}

function KpiCard({
    label,
    value,
    sub,
    icon,
}: {
    label: string;
    value: string;
    sub: string;
    icon: React.ReactNode;
}) {
    return (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
                <span className="text-xs uppercase tracking-wide">{label}</span>
                <span className="text-gray-400">{icon}</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</div>
        </div>
    );
}
