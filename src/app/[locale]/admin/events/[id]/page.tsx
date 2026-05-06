import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { EventStatusBadge } from "@/components/ui/Badge";
import { format } from "date-fns";
import { Calendar, Building2, User } from "lucide-react";
import { EventReviewActions } from "./EventReviewActions";
import type { EventStatus } from "@/types/database";

interface EventDetail {
    id: string;
    name: string;
    description: string | null;
    event_date: string;
    status: EventStatus;
    created_at: string;
    facilities: { name: string; city: string } | null;
    profiles: { display_name: string | null } | null;
}

export const metadata = { title: "Review Event – Admin" };

export default async function AdminEventDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const supabase = await createClient();
    const locale = await getLocale();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const profileResult = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if ((profileResult.data as { role: string } | null)?.role !== "admin") {
        redirect(`/${locale}`);
    }

    const { data, error } = await supabase
        .from("events")
        .select("id, name, description, event_date, status, created_at, facilities(name, city), profiles(display_name)")
        .eq("id", id)
        .single();

    if (error || !data) notFound();

    const event = data as unknown as EventDetail;

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">
            <div className="flex items-center gap-4">
                <Link href={`/${locale}/admin/events`} className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white">
                    ← Event Queue
                </Link>
            </div>

            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{event.name}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Submitted on {format(new Date(event.created_at), "PP")}
                    </p>
                </div>
                <EventStatusBadge status={event.status} />
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                    <span>{format(new Date(event.event_date), "PPP")}</span>
                </div>
                {event.facilities && (
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                        <span>{event.facilities.name}, {event.facilities.city}</span>
                    </div>
                )}
                {event.profiles && (
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <User className="h-4 w-4 text-gray-400 shrink-0" />
                        <span>Submitted by {event.profiles.display_name ?? "Unknown"}</span>
                    </div>
                )}
                {event.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed pt-2 border-t border-gray-100 dark:border-gray-800">
                        {event.description}
                    </p>
                )}
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-5">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Review Decision</h2>
                <EventReviewActions eventId={event.id} locale={locale} />
            </div>
        </div>
    );
}
