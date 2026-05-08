import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { format } from "date-fns";
import Link from "next/link";
import { Calendar, MapPin, Building2, ArrowRight } from "lucide-react";
import type { Metadata } from "next";

interface EventRow {
    id: string;
    name: string;
    description: string | null;
    event_date: string;
    status: string;
    facilities: {
        id: string;
        name: string;
        slug: string;
        city: string;
        address: string;
    } | null;
    profiles: { display_name: string | null } | null;
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const { id } = await params;
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
        .from("events")
        .select("name, description")
        .eq("id", id)
        .eq("status", "approved")
        .single();
    return {
        title: data?.name ? `${data.name} — Saha` : "Event",
        description: data?.description ?? undefined,
    };
}

export default async function EventDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const locale = await getLocale();
    const supabase = await createClient();

    // RLS allows anyone to read approved events; pending/rejected are
    // hidden from non-owners.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
        .from("events")
        .select("id, name, description, event_date, status, facilities(id, name, slug, city, address), profiles(display_name)")
        .eq("id", id)
        .eq("status", "approved")
        .single();

    const event = data as EventRow | null;
    if (!event) notFound();

    const date = new Date(event.event_date);

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
            {/* Date hero */}
            <div className="flex items-start gap-5">
                <div className="shrink-0 w-20 text-center bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3">
                    <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                        {format(date, "dd")}
                    </div>
                    <div className="text-xs uppercase text-emerald-700 dark:text-emerald-400 font-medium">
                        {format(date, "MMM yyyy")}
                    </div>
                </div>
                <div className="flex-1 min-w-0 pt-1">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{event.name}</h1>
                    <div className="flex items-center gap-2 mt-2 text-sm text-gray-500 dark:text-gray-400">
                        <Calendar className="h-4 w-4" />
                        {format(date, "EEEE, MMMM d, yyyy · h:mm a")}
                    </div>
                </div>
            </div>

            {/* Description */}
            {event.description && (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{event.description}</p>
                </div>
            )}

            {/* Venue */}
            {event.facilities && (
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
                    <h2 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                        <Building2 className="h-4 w-4 text-emerald-500" />
                        {event.facilities.name}
                    </h2>
                    <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span>{event.facilities.address}, {event.facilities.city}</span>
                    </p>
                    {event.profiles?.display_name && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Hosted by {event.profiles.display_name}
                        </p>
                    )}
                    <div className="pt-2">
                        <Link
                            href={`/${locale}/f/${event.facilities.slug}`}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                        >
                            Book a court at this venue
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
