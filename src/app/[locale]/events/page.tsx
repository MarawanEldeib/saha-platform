import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { format } from "date-fns";

export const metadata = { title: "Sports Events" };

export default async function EventsPage() {
    const t = await getTranslations("events");
    const supabase = await createClient();

    const { data: events } = await supabase
        .from("events")
        .select("*, facilities(name, city), profiles(display_name)")
        .eq("status", "approved")
        .gte("event_date", new Date().toISOString())
        .order("event_date", { ascending: true });

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="mb-10">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-2">{t("subtitle")}</p>
            </div>

            {(!events || events.length === 0) ? (
                <p className="text-gray-500 dark:text-gray-400">{t("no_events")}</p>
            ) : (
                <div className="space-y-4">
                    {events.map((event) => (
                        <div
                            key={event.id}
                            className="flex items-start gap-5 p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors group"
                        >
                            <div className="shrink-0 w-14 text-center">
                                <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                                    {format(new Date(event.event_date), "dd")}
                                </div>
                                <div className="text-xs uppercase text-gray-500 dark:text-gray-400 font-medium">
                                    {format(new Date(event.event_date), "MMM")}
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h2 className="font-semibold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                    {event.name}
                                </h2>
                                {event.description && (
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{event.description}</p>
                                )}
                                <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500 dark:text-gray-500">
                                    {event.facilities && (
                                        <span>{t("venue")}: {(event.facilities as { name: string; city: string }).name}, {(event.facilities as { name: string; city: string }).city}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
