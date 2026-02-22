import { createClient } from "@/lib/supabase/server";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { FacilityStatusBadge, EventStatusBadge } from "@/components/ui/Badge";
import { format } from "date-fns";
import { Users, Building2, CalendarDays } from "lucide-react";
import type { FacilityStatus, EventStatus } from "@/types/database";

// Local typed interfaces for complex join queries (Supabase join types require explicit casts)
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

export default async function AdminPage() {
    const t = await getTranslations("admin");
    const locale = await getLocale();
    const supabase = await createClient();

    // Auth guard
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const profileResult = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const profile = profileResult.data as unknown as ProfileRow | null;
    if (profile?.role !== "admin") redirect(`/${locale}`);

    // Fetch counts
    const [
        { count: pendingFacilities },
        { count: pendingEvents },
        { count: totalUsers },
        facilitiesResult,
        eventsResult,
    ] = await Promise.all([
        supabase.from("facilities").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("events").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
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

    const recentFacilities = (facilitiesResult.data ?? []) as unknown as PendingFacility[];
    const recentEvents = (eventsResult.data ?? []) as unknown as PendingEvent[];

    const stats = [
        { label: t("stat_pending_facilities"), value: pendingFacilities ?? 0, icon: Building2, color: "text-amber-500" },
        { label: t("stat_pending_events"), value: pendingEvents ?? 0, icon: CalendarDays, color: "text-blue-500" },
        { label: t("stat_users"), value: totalUsers ?? 0, icon: Users, color: "text-emerald-500" },
    ] as const;

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {stats.map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                            <Icon className={`h-6 w-6 ${color}`} />
                        </div>
                        <div>
                            <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{value}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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

            {/* Quick Links */}
            <div className="flex flex-wrap gap-3">
                <Button variant="outline" asChild>
                    <Link href={`/${locale}/admin/outreach`}>Email Outreach</Link>
                </Button>
            </div>
        </div>
    );
}
