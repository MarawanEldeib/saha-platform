import { createClient } from "@/lib/supabase/server";
import { ADMIN_PAGE_SIZE } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import Link from "next/link";
import { format } from "date-fns";
import { Users, Filter, ShieldCheck, ShieldX, BadgeCheck } from "lucide-react";
import type { Metadata } from "next";
import { UserActions } from "./UserActions";

export const metadata: Metadata = { title: "Admin · Users — Saha" };

const PAGE_SIZE = ADMIN_PAGE_SIZE;

const ROLE_STYLES: Record<string, string> = {
    user: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    business: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    admin: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

type SearchParams = {
    q?: string;
    role?: string;
    from?: string;
    page?: string;
};

interface ProfileRow {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    role: "user" | "business" | "admin";
    phone: string | null;
    phone_verified: boolean;
    no_show_count: number;
    deletion_requested_at: string | null;
    created_at: string;
}

export default async function AdminUsersPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const supabase = await createClient();
    const locale = await getLocale();

    // Defense in depth — layout already enforces admin.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);
    const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single();
    if ((profile as { role: string } | null)?.role !== "admin") redirect(`/${locale}`);

    const { q, role: roleFilter, from, page: pageParam } = await searchParams;
    const page = Math.max(1, Number(pageParam) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const admin = createAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = admin
        .from("profiles")
        .select(
            "id, display_name, avatar_url, role, phone, phone_verified, no_show_count, deletion_requested_at, created_at",
            { count: "exact" },
        );

    if (q && q.trim()) {
        // ILIKE search on display_name. Email lookup is handled below by
        // intersecting with the auth.users page result, since profiles
        // doesn't carry email.
        query = query.ilike("display_name", `%${q.trim()}%`);
    }
    if (roleFilter && roleFilter !== "all") {
        query = query.eq("role", roleFilter);
    }
    if (from) {
        query = query.gte("created_at", from);
    }

    query = query
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

    const { data: rows, count } = await query;
    const profiles = (rows ?? []) as ProfileRow[];
    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // Pull emails in a single auth admin listUsers page — match by id.
    // listUsers max perPage is 1000; for our scale that's enough for the
    // current page of profiles. We over-fetch to cover edge cases.
    const emailById = new Map<string, string>();
    try {
        const { data: authPage } = await admin.auth.admin.listUsers({ perPage: 1000, page: 1 });
        for (const u of authPage?.users ?? []) {
            if (u.id && u.email) emailById.set(u.id, u.email);
        }
    } catch {
        /* swallow — we'll render "—" for missing emails */
    }

    const buildLink = (overrides: Partial<SearchParams>) => {
        const next = new URLSearchParams();
        const nextQ = overrides.q ?? q;
        const nextRole = overrides.role ?? roleFilter;
        const nextFrom = overrides.from ?? from;
        if (nextQ) next.set("q", nextQ);
        if (nextRole && nextRole !== "all") next.set("role", nextRole);
        if (nextFrom) next.set("from", nextFrom);
        const p = overrides.page ?? String(page);
        if (p && p !== "1") next.set("page", p);
        const qs = next.toString();
        return `/${locale}/admin/users${qs ? `?${qs}` : ""}`;
    };

    const ROLES = ["all", "user", "business", "admin"] as const;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-emerald-500" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Users</h1>
                <span className="text-xs text-gray-500 dark:text-gray-400">{total.toLocaleString()} total</span>
            </div>

            <form
                method="GET"
                className="flex flex-wrap items-end gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4"
            >
                <div className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                    <Filter className="h-4 w-4" /> Filters
                </div>
                <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Search name</span>
                    <input
                        type="search"
                        name="q"
                        defaultValue={q ?? ""}
                        placeholder="display_name…"
                        className="text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800"
                    />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Role</span>
                    <select
                        name="role"
                        defaultValue={roleFilter ?? "all"}
                        className="text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800"
                    >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Registered from</span>
                    <input
                        type="date"
                        name="from"
                        defaultValue={from ?? ""}
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
                    href={`/${locale}/admin/users`}
                    className="px-4 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                    Clear
                </Link>
            </form>

            {profiles.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                    No users match these filters.
                </p>
            ) : (
                <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400">
                            <tr>
                                <th className="text-start px-4 py-3 font-medium">User</th>
                                <th className="text-start px-4 py-3 font-medium">Role</th>
                                <th className="text-start px-4 py-3 font-medium hidden md:table-cell">No-shows</th>
                                <th className="text-start px-4 py-3 font-medium hidden md:table-cell">Joined</th>
                                <th className="text-start px-4 py-3 font-medium">State</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {profiles.map((p) => {
                                const email = emailById.get(p.id) ?? null;
                                const initials =
                                    p.display_name?.trim().split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
                                    || (email ? email[0].toUpperCase() : "?");
                                const isBanned = !!p.deletion_requested_at;
                                const isSelf = p.id === user.id;
                                return (
                                    <tr key={p.id} className="bg-white dark:bg-gray-900">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="shrink-0 w-9 h-9 rounded-full overflow-hidden bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center" aria-hidden>
                                                    {p.avatar_url ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{initials}</span>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-medium text-gray-900 dark:text-white truncate flex items-center gap-1.5">
                                                        {p.display_name ?? "—"}
                                                        {p.phone_verified && (
                                                            <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" aria-label="Phone verified" />
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{email ?? "—"}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_STYLES[p.role] ?? ""}`}>
                                                {p.role}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-gray-300 hidden md:table-cell">
                                            {p.no_show_count}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-gray-500 dark:text-gray-400 hidden md:table-cell">
                                            {format(new Date(p.created_at), "MMM d, yyyy")}
                                        </td>
                                        <td className="px-4 py-3">
                                            {isBanned ? (
                                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                                    <ShieldX className="h-3 w-3" /> banned
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                                                    <ShieldCheck className="h-3 w-3" /> active
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-end">
                                            {isSelf ? (
                                                <span className="text-xs text-gray-400 dark:text-gray-500 italic">you</span>
                                            ) : (
                                                <UserActions
                                                    userId={p.id}
                                                    displayName={p.display_name ?? p.id.slice(0, 8)}
                                                    currentRole={p.role}
                                                    isBanned={isBanned}
                                                />
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Page {page} of {totalPages}</span>
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
