// SAH-144: controlled vocabulary for slot session types. The enum on
// court_availability.session_type enforces this list at the DB level.

export const SESSION_TYPES = ["mixed", "family", "women_only", "men_only"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export function isValidSessionType(t: string): t is SessionType {
    return (SESSION_TYPES as readonly string[]).includes(t);
}

export function sanitizeSessionType(t: unknown): SessionType {
    return typeof t === "string" && isValidSessionType(t) ? t : "mixed";
}

// Tailwind class map for chip rendering. Kept aligned with the event-tag
// styles for women_only / men_only so the same audience reads them
// consistently across events and slots.
export const SESSION_TYPE_STYLES: Record<SessionType, string> = {
    mixed: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    family: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    women_only: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
    men_only: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

// Small unicode glyphs work in chips without bringing in another icon set.
export const SESSION_TYPE_GLYPHS: Record<SessionType, string> = {
    mixed: "",
    family: "👨‍👩‍👧",
    women_only: "♀",
    men_only: "♂",
};
