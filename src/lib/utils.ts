import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges Tailwind CSS classes safely, resolving conflicts */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/** Format a date string to localised display */
export function formatDate(date: string | Date, locale = "en-DE"): string {
    return new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(new Date(date));
}

/** Format opening time for display */
export function formatTime(time: string | null): string {
    if (!time) return "";
    const [h, m] = time.split(":");
    return `${h}:${m}`;
}

/** Build the public URL for a Supabase Storage object */
export function getStorageUrl(bucket: string, path: string): string {
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

/** Truncate a string to a maximum length with ellipsis */
export function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 1) + "…";
}

/** Convert 0-based day index to day name key in i18n messages */
export const DAY_KEYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
] as const;
