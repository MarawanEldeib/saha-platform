import { createClient } from "@/lib/supabase/server";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { FacilityStatusBadge, EventStatusBadge } from "@/components/ui/Badge";
import { format } from "date-fns";
import {
    Users,
    Building2,
    CalendarDays,
    BookOpen,
    DollarSign,
    AlertTriangle,
} from "lucide-react";
import type { FacilityStatus, EventStatus } from "@/types/database";

interface ProfileRow { role: string }
interface PendingFacility {
    id: string;
    name: string;
    status: FacilityStatus;
    city: string;
    created_at: string;
    profiles: { display_name: string | null } | null;
}
interface PendingEvent {
    id: string;
    name: string;
    status: EventStatus;
    event_date: string;
    facilities: { name: string } | null;
}

export const metadata = { title: "Admin Panel" };

const aedFmt = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 });

export default async function AdminPage() {
    const t = await getTranslations("admin");
    const locale = await getLocale();
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const profileResult = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const profile = profileResult.data as unknown as ProfileRow | null;
    if (profile?.role !== "admin") redirect(`/${locale}`);

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [
        { count: pendingFacilities },
        { count: pendingEvents },
        { count: totalUsers },
        { count: totalFacilities },
        { count: activeFacilities },
        { count: bookings7d },
        { count: bookings30d },
        { count: bookingsToday },
        { count: openDisputes },
        { data: revenue30dRows },
        { data: profilesByRole },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...rest
    ] = await Promise.all([
        supabase.from("facilities").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("events").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("facilities").select("*", { count: "exact", head: true }),
        supabase.from("facilities").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("bookings").select("*", { count: "exact", head: true })
            .gte("date", sevenDaysAgo)
            .in("status", ["confirmed", "completed"]),
        supabase.from("bookings").select("*", { count: "exact", head: true })
            .gte("date", thirtyDaysAgo)
            .in("status", ["confirmed", "completed"]),
        supabase.from("bookings").select("*", { count: "exact", head: true })
            .eq("date", today)
            .in("status", ["confirmed", "completed"]),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("audit_log").select("*", { count: "exact", head: true })
            .eq("action", "stripe.dispute.created")
            .gte("created_at", thirtyDaysAgo),
        supabase.from("bookings").select("total_price")
            .gte("date", thirtyDaysAgo)
            .in("status", ["confirmed", "completed"]),
        supabase.from("profiles").select("role"),
        supabase
            .from("facilities")
            .select("id, name, status, city, created_at, profiles(display_name)")
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(8),
        supabase
            .from("events")
            .select("id, name, status, event_date, facilities(name)")
            .eq("status", "pending")
            .order("event_date", { ascending: true })
            .limit(8),
    ]);

    const recentFacilities = (rest[0]?.data ?? []) as unknown as PendingFacility[];
    const recentEvents = (rest[1]?.data ?? []) as unknown as PendingEvent[];

    const grossRevenue30d = (revenue30dRows ?? []).reduce(
        (sum: number, row: { total_price: number }) => sum + Number(row.total_price ?? 0),
        0,
    );
    // Platform fee is 10%; net to owners is 90%.
    const platformFee30d = grossRevenue30d * 0.10;

    const roleCounts = (profilesByRole ?? []).reduce<Record<string, number>>((acc, row) => {
        const r = (row as { role: string }).role;
        acc[r] = (acc[r] ?? 0) + 1;
        return acc;
    }, {});

    const cards = [
        {
            label: "Total users",
            value: (totalUsers ?? 0).toLocaleString(),
            sub: `${roleCounts.user ?? 0} players · ${roleCounts.business ?? 0} owners · ${roleCounts.admin ?? 0} admins`,
            icon: Users,
            tone: "text-emerald-600",
        },
        {
            label: "Facilities",
            value: (totalFacilities ?? 0).toLocaleString(),
            sub: `${activeFacilities ?? 0} active · ${pendingFacilities ?? 0} pending review`,
            icon: Building2,
            tone: "text-blue-600",
        },
        {
            label: "Bookings today",
            value: (bookingsToday ?? 0).toLocaleString(),
            sub: `${bookings7d ?? 0} this week · ${bookings30d ?? 0} this month`,
            icon: BookOpen,
            tone: "text-purple-600",
        },
        {
            label: "Revenue (30d)",
            value: aedFmt.format(grossRevenue30d),
            sub: `Platform fees: ${aedFmt.format(platformFee30d)}`,
            icon: DollarSign,
            tone: "text-amber-600",
        },
        {
            label: "Pending events",
            value: (pendingEvents ?? 0).toLocaleString(),
            sub: "Awaiting approval",
            icon: CalendarDays,
            tone: "text-indigo-600",
        },
        {
            label: "Open disputes",
            value: (openDisputes ?? 0).toLocaleString(),
            sub: "Last 30 days",
            icon: AlertTriangle,
            tone: openDisputes && openDisputes > 0 ? "text-red-600" : "text-gray-500",
        },
    ];

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Platform overview · {format(now, "EEEE, MMMM d, yyyy")}
                </p>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {cards.map(({ label, value, sub, icon: Icon, tone }) => (
                    <div
                        key={label}
                        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
                            <Icon className={`h-5 w-5 ${tone}`} />
                        </div>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{sub}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pending Facilities */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                    <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                        <h2 className="font-semibold text-gray-900 dark:text-white">{t("pending_facilities")}</h2>
                        <Link href={`/${locale}/admin/facilities`} className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">
                            {t("view_all")}
                        </Link>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {recentFacilities.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">{t("none")}</p>
                        ) : (
                            recentFacilities.map((f) => (
                                <div key={f.id} className="flex items-center justify-between px-5 py-3 gap-4">
                                    <div className="min-w-0">
                                        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{f.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{f.city} · {format(new Date(f.created_at), "PP")}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <FacilityStatusBadge status={f.status} />
                                        <Button variant="outline" size="sm" asChild>
                                            <Link href={`/${locale}/admin/facilities/${f.id}`}>Review</Link>
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Pending Events */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                    <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                        <h2 className="font-semibold text-gray-900 dark:text-white">{t("pending_events")}</h2>
                        <Link href={`/${locale}/admin/events`} className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">
                            {t("view_all")}
                        </Link>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {recentEvents.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">{t("none")}</p>
                        ) : (
                            recentEvents.map((ev) => (
                                <div key={ev.id} className="flex items-center justify-between px-5 py-3 gap-4">
                                    <div className="min-w-0">
                                        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{ev.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {ev.facilities?.name} · {format(new Date(ev.event_date), "PP")}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <EventStatusBadge status={ev.status} />
                                        <Button variant="outline" size="sm" asChild>
                                            <Link href={`/${locale}/admin/events/${ev.id}`}>Review</Link>
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
