import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_PAGE_SIZE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Star } from "lucide-react";
import { ReviewModerationActions } from "./ReviewModerationActions";

interface ReviewRow {
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    hidden_at: string | null;
    hidden_reason: string | null;
    facility_id: string;
    user_id: string;
    facilities: { name: string; city: string } | null;
    profiles: { display_name: string | null } | null;
}

export const metadata = { title: "Reviews – Admin" };

const PAGE_SIZE = ADMIN_PAGE_SIZE;

export default async function AdminReviewsPage({
    searchParams,
}: {
    searchParams: Promise<{
        status?: string;
        rating?: string;
        facility?: string;
        q?: string;
        page?: string;
    }>;
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
    const statusFilter = params.status === "hidden" ? "hidden" : params.status === "visible" ? "visible" : "all";
    const ratingFilter = params.rating ? parseInt(params.rating, 10) : null;
    const facilityFilter = params.facility?.trim() ?? "";
    const searchTerm = params.q?.trim() ?? "";
    const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

    // Use admin client so RLS doesn't filter out hidden rows. The admin
    // gate above is the authorization layer; admin client gives us full
    // visibility into the moderation queue.
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (admin as any)
        .from("reviews")
        .select(
            "id, rating, comment, created_at, hidden_at, hidden_reason, facility_id, user_id, facilities(name, city), profiles(display_name)",
            { count: "exact" },
        )
        .order("created_at", { ascending: false });

    if (statusFilter === "hidden") query = query.not("hidden_at", "is", null);
    if (statusFilter === "visible") query = query.is("hidden_at", null);
    if (ratingFilter && ratingFilter >= 1 && ratingFilter <= 5) {
        query = query.eq("rating", ratingFilter);
    }
    if (searchTerm) query = query.ilike("comment", `%${searchTerm}%`);

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    query = query.range(from, to);

    const { data, count } = await query;
    let reviews = (data ?? []) as unknown as ReviewRow[];

    // Facility filter is applied client-side (after the join) since
    // PostgREST can't filter on the joined facility name in one statement
    // alongside an ilike on the parent comment column. The page-size of 50
    // keeps this cheap.
    if (facilityFilter) {
        const needle = facilityFilter.toLowerCase();
        reviews = reviews.filter((r) =>
            (r.facilities?.name ?? "").toLowerCase().includes(needle),
        );
    }

    const totalCount = count ?? reviews.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    const buildHref = (overrides: Partial<{ status: string; rating: string; facility: string; q: string; page: string }>) => {
        const sp = new URLSearchParams();
        const merged = {
            status: statusFilter,
            rating: ratingFilter ? String(ratingFilter) : "",
            facility: facilityFilter,
            q: searchTerm,
            page: String(page),
            ...overrides,
        };
        for (const [k, v] of Object.entries(merged)) {
            if (v && v !== "all") sp.set(k, v);
        }
        const qs = sp.toString();
        return `/${locale}/admin/reviews${qs ? `?${qs}` : ""}`;
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href={`/${locale}/admin`} className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white">
                    ← Admin
                </Link>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reviews</h1>
                <span className="text-sm text-gray-500 dark:text-gray-400">{totalCount} total</span>
            </div>

            <form
                method="get"
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
            >
                <select
                    name="status"
                    defaultValue={statusFilter}
                    className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                >
                    <option value="all">All</option>
                    <option value="visible">Visible</option>
                    <option value="hidden">Hidden</option>
                </select>
                <select
                    name="rating"
                    defaultValue={ratingFilter ? String(ratingFilter) : ""}
                    className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                >
                    <option value="">All ratings</option>
                    {[5, 4, 3, 2, 1].map((r) => (
                        <option key={r} value={r}>{r} ★</option>
                    ))}
                </select>
                <input
                    type="text"
                    name="facility"
                    defaultValue={facilityFilter}
                    placeholder="Facility name…"
                    className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                />
                <input
                    type="text"
                    name="q"
                    defaultValue={searchTerm}
                    placeholder="Search comment…"
                    className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                />
                <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700 transition-colors"
                >
                    Apply
                </button>
            </form>

            {reviews.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center text-gray-500 dark:text-gray-400">
                    No reviews match these filters.
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {reviews.map((r) => (
                            <div
                                key={r.id}
                                className={`p-5 flex flex-col gap-3 ${r.hidden_at ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}`}
                            >
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-gray-900 dark:text-white">
                                            {r.facilities?.name ?? "Unknown facility"}
                                            {r.facilities?.city ? `, ${r.facilities.city}` : ""}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                            by {r.profiles?.display_name ?? "Unknown"} · {format(new Date(r.created_at), "PP")}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 text-amber-500 shrink-0">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <Star
                                                key={i}
                                                className={`h-4 w-4 ${i < r.rating ? "fill-amber-500" : "fill-none stroke-gray-300 dark:stroke-gray-600"}`}
                                            />
                                        ))}
                                        <span className="text-sm text-gray-700 dark:text-gray-300 ml-1">{r.rating}/5</span>
                                    </div>
                                </div>
                                {r.comment && (
                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                        {r.comment}
                                    </p>
                                )}
                                {r.hidden_at && (
                                    <p className="text-xs text-amber-700 dark:text-amber-400">
                                        Hidden on {format(new Date(r.hidden_at), "PP")}
                                        {r.hidden_reason ? ` — ${r.hidden_reason}` : ""}
                                    </p>
                                )}
                                <ReviewModerationActions
                                    reviewId={r.id}
                                    isHidden={!!r.hidden_at}
                                />
                            </div>
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
