// SAH-146: controlled vocabulary for event tags. The CHECK constraint on
// events.tags enforces this list at the DB level — keep the two in sync.

export const EVENT_TAGS = [
    "family_friendly",
    "no_music",
    "ramadan_friendly_hours",
    "post_taraweeh",
    "ramadan_fitness",
    "women_only",
    "men_only",
] as const;

export type EventTag = (typeof EVENT_TAGS)[number];

export function isValidEventTag(tag: string): tag is EventTag {
    return (EVENT_TAGS as readonly string[]).includes(tag);
}

export function sanitizeEventTags(input: unknown): EventTag[] {
    if (!Array.isArray(input)) return [];
    return Array.from(new Set(input.filter((t): t is EventTag => typeof t === "string" && isValidEventTag(t))));
}

// Tailwind class map per tag — keeps chip colors consistent across forms,
// admin views, and public pages without a runtime lookup.
export const EVENT_TAG_STYLES: Record<EventTag, string> = {
    family_friendly: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    no_music: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300",
    ramadan_friendly_hours: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    post_taraweeh: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
    ramadan_fitness: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
    women_only: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
    men_only: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};
