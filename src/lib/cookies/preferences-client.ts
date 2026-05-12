// SAH-122: client-side read/write helpers for functional cookies. Every
// write is gated by hasConsent() — if the user rejected (or hasn't seen
// the banner yet) we silently skip the write. The server-side reads
// apply the same gate, so a rejected user behaves identically to a user
// with no preferences set.

import { COOKIE, type LastSearch, type ResumeBooking, RECENT_FACILITIES_MAX, RESUME_BOOKING_TTL_HOURS } from "./preferences";

export function hasConsent(): boolean {
    if (typeof document === "undefined") return false;
    return document.cookie.includes(`${COOKIE.CONSENT}=accepted`);
}

function readCookie(name: string): string | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, maxAgeDays: number): void {
    if (typeof document === "undefined") return;
    if (!hasConsent()) return;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeDays * 86400}; Path=/; SameSite=Lax${secure}`;
}

function deleteCookie(name: string): void {
    if (typeof document === "undefined") return;
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}

// ---------- #1 welcome-back ----------
export function setLastSearch(s: LastSearch): void {
    writeCookie(COOKIE.LAST_SEARCH, JSON.stringify(s), 30);
}

// ---------- #2 recently-viewed ----------
export function addRecentFacility(id: string): void {
    const current = readCookie(COOKIE.RECENT_FACILITIES);
    const list = current ? current.split(",").filter(Boolean) : [];
    const next = [id, ...list.filter((x) => x !== id)].slice(0, RECENT_FACILITIES_MAX);
    writeCookie(COOKIE.RECENT_FACILITIES, next.join(","), 30);
}

// ---------- #3 resume abandoned booking ----------
export function setResumeBooking(b: Omit<ResumeBooking, "expires_at">): void {
    const expires_at = new Date(Date.now() + RESUME_BOOKING_TTL_HOURS * 3_600_000).toISOString();
    writeCookie(COOKIE.RESUME_BOOKING, JSON.stringify({ ...b, expires_at }), 7);
}

export function clearResumeBooking(): void {
    deleteCookie(COOKIE.RESUME_BOOKING);
}

// ---------- #4 onboarding tooltip ----------
export function isOnboardingMapSeen(): boolean {
    return readCookie(COOKIE.ONBOARDING_MAP) === "1";
}

export function markOnboardingMapSeen(): void {
    writeCookie(COOKIE.ONBOARDING_MAP, "1", 365);
}

// ---------- #5 A/B bucket ----------
export function ensureABBucket(): void {
    if (!hasConsent()) return;
    const existing = readCookie(COOKIE.AB_BUCKET);
    if (existing) return;
    // Random 8-char base36 — enough entropy for sticky experiments.
    const bucket = Math.random().toString(36).slice(2, 10);
    writeCookie(COOKIE.AB_BUCKET, bucket, 365);
}
