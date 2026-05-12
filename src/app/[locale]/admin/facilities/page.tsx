import { createClient } from "@/lib/supabase/server";
import { ADMIN_PAGE_SIZE } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FacilityStatusBadge } from "@/components/ui/Badge";
import { format } from "date-fns";
import type { FacilityStatus } from "@/types/database";

interface FacilityRow {
    id: string;
    name: string;
    status: FacilityStatus;
    city: string;
    created_at: string;
    profiles: { display_name: string | null } | null;
}

export const metadata = { title: "Facilities – Admin" };

const PAGE_SIZE = ADMIN_PAGE_SIZE;

export default async function AdminFacilitiesPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
    const supabase = await createClient();
    const locale = await getLocale();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const profileResult = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if ((profileResult.data as { role: string } | null)?.role !== "admin") {
        redirect(`/${locale}`);
    }

    const params = await searchParams;
    const statusFilter =
        params.status === "active" || params.status === "suspended" || params.status === "pending"
            ? params.status
            : params.status === "all"
                ? "all"
                : "pending"; // default to pending — that's the moderation queue
    const searchTerm = params.q?.trim() ?? "";
    const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (admin as any)
        .from("facilities")
        .select(
            "id, name, status, city, created_at, profiles!inner(display_name)",
            { count: "exact" },
        )
        .order("created_at", { ascending: false });

    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (searchTerm) query = query.ilike("name", `%${searchTerm}%`);

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    query = query.range(from, to);

    const { data, count } = await query;
    const facilities = (data ?? []) as unknown as FacilityRow[];
    const totalCount = count ?? facilities.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    const buildHref = (overrides: Partial<{ status: string; q: string; page: string }>) => {
        const sp = new URLSearchParams();
        const merged = {
            status: statusFilter,
            q: searchTerm,
            page: String(page),
            ...overrides,
        };
        for (const [k, v] of Object.entries(merged)) {
            if (v && !(k === "status" && v === "pending") && !(k === "page" && v === "1")) sp.set(k, v);
        }
        const qs = sp.toString();
        return `/${locale}/admin/facilities${qs ? `?${qs}` : ""}`;
    };

    const filterChips: Array<{ value: string; label: string }> = [
        { value: "pending", label: "Pending" },
        { value: "active", label: "Active" },
        { value: "suspended", label: "Suspended" },
        { value: "all", label: "All" },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4 flex-wrap">
                <Link href={`/${locale}/admin`} className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white">
                    ← Admin
                </Link>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Facilities</h1>
                <span className="text-sm text-gray-500 dark:text-gray-400">{totalCount} total</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex flex-wrap gap-2">
                    {filterChips.map((chip) => {
                        const active = statusFilter === chip.value;
                        return (
                            <Link
                                key={chip.value}
                                href={buildHref({ status: chip.value, page: "1" })}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                    active
                                        ? "bg-emerald-600 text-white"
                                        : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                }`}
                            >
                                {chip.label}
                            </Link>
                        );
                    })}
                </div>

                <form method="get" className="flex-1 sm:max-w-xs">
                    <input type="hidden" name="status" value={statusFilter} />
                    <input
                        type="text"
                        name="q"
                        defaultValue={searchTerm}
                        placeholder="Search by facility name…"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm"
                    />
                </form>
            </div>

            {facilities.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center">
                    <p className="text-gray-500 dark:text-gray-400">
                        {statusFilter === "pending"
                            ? "No facilities awaiting review. All clear!"
                            : "No facilities match these filters."}
                    </p>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {facilities.map((facility) => (
                            <Link
                                key={facility.id}
                                href={`/${locale}/admin/facilities/${facility.id}`}
                                className="flex items-center justify-between px-6 py-4 gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium text-gray-900 dark:text-white">{facility.name}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                        {facility.city} &middot; Owner: {facility.profiles?.display_name ?? "Unknown"} &middot; {format(new Date(facility.created_at), "PP")}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <FacilityStatusBadge status={facility.status} />
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        Page {page} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                        {page > 1 && (
                            <Link
                                href={buildHref({ page: String(page - 1) })}
                                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                Previous
                            </Link>
                        )}
                        {page < totalPages && (
                            <Link
                                href={buildHref({ page: String(page + 1) })}
                                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
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
