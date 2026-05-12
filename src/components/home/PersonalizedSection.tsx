import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowRight, Clock, History, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
    getRecentFacilities,
    getLastSearch,
    getResumeBooking,
} from "@/lib/cookies/preferences-server";

// SAH-122: personalized hero strip. Renders nothing unless the user has
// accepted cookies AND at least one signal (recent facilities, last
// search, or an unfinished booking). Server component — runs inline in
// the home-page request, no client roundtrip.

type Props = { locale: string };

export async function PersonalizedSection({ locale }: Props) {
    const [recentIds, lastSearch, resume] = await Promise.all([
        getRecentFacilities(),
        getLastSearch(),
        getResumeBooking(),
    ]);

    // Short-circuit: nothing to show.
    if (recentIds.length === 0 && !lastSearch && !resume) return null;

    const t = await getTranslations("home.personalized");
    const supabase = await createClient();

    // Batch the two facility-name lookups (resume + recent) into one query.
    const wantedIds = Array.from(
        new Set([...(resume ? [resume.facility_id] : []), ...recentIds]),
    );
    const { data: facilities } = wantedIds.length
        ? await supabase
              .from("facilities")
              .select("id, name, city")
              .in("id", wantedIds)
              .eq("status", "active")
        : { data: [] as { id: string; name: string; city: string }[] };

    const facilityById = new Map((facilities ?? []).map((f) => [f.id, f]));
    const resumeFacility = resume ? facilityById.get(resume.facility_id) : null;
    const recents = recentIds
        .map((id) => facilityById.get(id))
        .filter((f): f is { id: string; name: string; city: string } => !!f);

    // Resume gets dropped if the facility is no longer active. Last
    // search + recents render independently.
    if (!resumeFacility && recents.length === 0 && !lastSearch) return null;

    // Resolve sport name for last-search label when a sport_id is present.
    let lastSearchSportName: string | null = null;
    if (lastSearch?.sport_id) {
        const { data: sport } = await supabase
            .from("sports")
            .select("name")
            .eq("id", lastSearch.sport_id)
            .single();
        lastSearchSportName = (sport as { name: string } | null)?.name ?? null;
    }

    return (
        <section className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2 space-y-3">
            {resume && resumeFacility && (
                <Link
                    href={`/${locale}/facilities/${resume.facility_id}`}
                    className="block rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 hover:border-amber-300 dark:hover:border-amber-800 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                                {t("resume_title")}
                            </p>
                            <p className="text-xs text-amber-800/80 dark:text-amber-300/80 truncate">
                                {t("resume_body", {
                                    facility: resumeFacility.name,
                                    players: resume.num_players,
                                })}
                            </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    </div>
                </Link>
            )}

            {(lastSearchSportName || lastSearch?.city) && (
                <Link
                    href={`/${locale}/map`}
                    className="block rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <RotateCcw className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                                {t("welcome_back_title")}
                            </p>
                            <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 truncate">
                                {t("welcome_back_body", {
                                    sport: lastSearchSportName ?? t("any_sport"),
                                    city: lastSearch?.city ?? t("any_city"),
                                })}
                            </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    </div>
                </Link>
            )}

            {recents.length > 0 && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <History className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {t("recent_title")}
                        </p>
                    </div>
                    <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                        {recents.map((f) => (
                            <Link
                                key={f.id}
                                href={`/${locale}/facilities/${f.id}`}
                                className="shrink-0 min-w-[180px] rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 hover:border-emerald-400 dark:hover:border-emerald-700 transition-colors"
                            >
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                    {f.name}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {f.city}
                                </p>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}
