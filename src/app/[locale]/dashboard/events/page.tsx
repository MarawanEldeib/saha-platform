import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { NewEventForm } from "./NewEventForm";
import { OwnerEventCard } from "./OwnerEventCard";
import { Calendar } from "lucide-react";
import { getActiveFacility } from "@/lib/facility-context";

export const metadata = { title: "Events – Saha" };

export default async function EventsPage() {
    const supabase = await createClient();
    const locale = await getLocale();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const facility = await getActiveFacility(supabase, user.id);

    if (!facility) {
        return (
            <div className="max-w-3xl">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Events</h1>
                <p className="text-gray-500">Please complete onboarding to submit events.</p>
            </div>
        );
    }

    // Get existing events
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: events } = await (supabase as any)
        .from("events")
        .select("*")
        .eq("facility_id", facility.id)
        .order("event_date", { ascending: true });

    return (
        <div className="max-w-3xl space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Events</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage and submit events for your facility.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Submit Form */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 self-start">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5">Submit New Event</h2>
                    <NewEventForm facilityId={facility.id} />
                </div>

                {/* Events List */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5">Your Events</h2>
                    
                    {!events || events.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400 border border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
                            <Calendar className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                            <p className="text-sm">No events submitted yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {events.map((event: { id: string; name: string; description: string | null; event_date: string; status: "pending" | "approved" | "rejected" }) => (
                                <OwnerEventCard
                                    key={event.id}
                                    event={event}
                                    facilityName={facility.name}
                                    locale={locale}
                                    formattedDate={new Date(event.event_date).toLocaleString(locale, { dateStyle: "long", timeStyle: "short" })}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
