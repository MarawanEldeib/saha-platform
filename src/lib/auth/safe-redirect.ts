import { routing } from "@/i18n/routing";

function normalizeLocale(locale: string): string {
    return routing.locales.includes(locale as "en" | "de")
        ? locale
        : routing.defaultLocale;
}

/**
 * Ensures redirect targets stay local to this app and fall back to locale home.
 */
export function getSafeRedirectPath(next: string | null | undefined, locale: string): string {
    const safeLocale = normalizeLocale(locale);
    const fallback = `/${safeLocale}`;

    if (!next) return fallback;
    if (!next.startsWith("/") || next.startsWith("//")) return fallback;

    return next;
}
