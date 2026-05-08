import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { format } from "date-fns";
import { ScrollText, ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Audit log — Admin" };

interface AuditRow {
    id: string;
    actor_id: string | null;
    actor_role: string;
    action: string;
    target_type: string;
    target_id: string | null;
    metadata: Record<string, unknown> | null;
    ip: string | null;
    created_at: string;
}

const PAGE_SIZE = 50;

const ACTION_TONES: Record<string, string> = {
    "facility.approve": "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    "facility.reject": "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    "event.approve": "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    "event.reject": "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    "booking.cancel.player": "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    "booking.cancel.owner": "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    "booking.no_show": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    "stripe.dispute.created": "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    "stripe.payout.failed": "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    "stripe.account.deauthorized": "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    "stripe.account.updated": "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    "payment.refunded.via_stripe_dashboard": "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

function actionTone(action: string): string {
    return ACTION_TONES[action] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
}

export default async function AuditLogPage({
    searchParams,
}: {
    searchParams: Promise<{ action?: string; target?: string; page?: string }>;
}) {
    const { action: actionFilter, target: targetFilter, page: pageStr } = await searchParams;
    const page = Math.max(1, Number.parseInt(pageStr ?? "1", 10) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
    if ((profile as { role: string } | null)?.role !== "admin") redirect(`/${locale}`);

    // Use admin client to bypass RLS — admins can read; the layout already
    // verified the role.
    const adminClient = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (adminClient as any)
        .from("audit_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

    if (actionFilter) query = query.eq("action", actionFilter);
    if (targetFilter) query = query.eq("target_type", targetFilter);
    query = query.range(offset, offset + PAGE_SIZE - 1);

    const { data, count } = await query;
    const rows = (data ?? []) as AuditRow[];
    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // Fetch the actor display names in one shot
    const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean) as string[]));
    let actorNames = new Map<string, string>();
    if (actorIds.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: actors } = await (adminClient as any)
            .from("profiles")
            .select("id, display_name")
            .in("id", actorIds);
        actorNames = new Map(((actors ?? []) as Array<{ id: string; display_name: string | null }>).map((a) => [a.id, a.display_name ?? "—"]));
    }

    const baseQs = (overrides: Record<string, string | undefined>) => {
        const params = new URLSearchParams();
        const merged = { action: actionFilter, target: targetFilter, page: String(page), ...overrides };
        for (const [k, v] of Object.entries(merged)) {
            if (v) params.set(k, v);
        }
        return params.toString();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <ScrollText className="h-5 w-5 text-emerald-500" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit log</h1>
                <span className="text-sm text-gray-500 dark:text-gray-400">{total.toLocaleString()} events</span>
            </div>

            {/* Filters */}
            <form className="flex flex-wrap gap-3 items-end" method="get">
                <label className="block text-sm">
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Action</span>
                    <input
                        name="action"
                        defaultValue={actionFilter ?? ""}
                        placeholder="e.g. facility.approve"
                        className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm w-56"
                    />
                </label>
                <label className="block text-sm">
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Target type</span>
                    <input
                        name="target"
                        defaultValue={targetFilter ?? ""}
                        placeholder="e.g. booking, facility"
                        className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm w-44"
                    />
                </label>
                <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                >
                    Apply
                </button>
                {(actionFilter || targetFilter) && (
                    <Link
                        href={`/${locale}/admin/audit-log`}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                        Clear
                    </Link>
                )}
            </form>

            {/* Table */}
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400">
                        <tr>
                            <th className="text-start px-4 py-3 font-medium">When</th>
                            <th className="text-start px-4 py-3 font-medium">Actor</th>
                            <th className="text-start px-4 py-3 font-medium">Action</th>
                            <th className="text-start px-4 py-3 font-medium">Target</th>
                            <th className="text-start px-4 py-3 font-medium">Metadata</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                                    No events match these filters.
                                </td>
                            </tr>
                        ) : (
                            rows.map((row) => (
                                <tr key={row.id} className="bg-white dark:bg-gray-900 align-top">
                                    <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                        {format(new Date(row.created_at), "yyyy-MM-dd HH:mm:ss")}
                                    </td>
                                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                                        <div className="text-xs uppercase text-gray-400">{row.actor_role}</div>
                                        <div className="truncate max-w-[14rem]">
                                            {row.actor_id ? (actorNames.get(row.actor_id) ?? row.actor_id.slice(0, 8)) : "system"}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${actionTone(row.action)}`}>
                                            {row.action}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                        <div className="text-xs uppercase text-gray-400">{row.target_type}</div>
                                        <div className="text-xs font-mono truncate max-w-[12rem]">{row.target_id?.slice(0, 8) ?? "—"}</div>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 max-w-md">
                                        {row.metadata ? (
                                            <pre className="whitespace-pre-wrap break-all font-mono text-[11px]">
                                                {JSON.stringify(row.metadata, null, 0)}
                                            </pre>
                                        ) : (
                                            <span className="text-gray-300">—</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        Page {page} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                        {page > 1 && (
                            <Link
                                href={`/${locale}/admin/audit-log?${baseQs({ page: String(page - 1) })}`}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                <ArrowLeft className="h-3.5 w-3.5" />
                                Previous
                            </Link>
                        )}
                        {page < totalPages && (
                            <Link
                                href={`/${locale}/admin/audit-log?${baseQs({ page: String(page + 1) })}`}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                Next
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
