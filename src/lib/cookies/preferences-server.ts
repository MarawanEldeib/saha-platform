import "server-only";
import { cookies } from "next/headers";
import { COOKIE, type LastSearch, type ResumeBooking, RECENT_FACILITIES_MAX } from "./preferences";

// SAH-122: server-side cookie reads. Server components and route
// handlers read functional cookies through these helpers; each one
// applies the same consent gate as the client side so a rejected user
// is indistinguishable from one with no history.

async function get(name: string): Promise<string | null> {
    const store = await cookies();
    return store.get(name)?.value ?? null;
}

export async function hasConsent(): Promise<boolean> {
    return (await get(COOKIE.CONSENT)) === "accepted";
}

export async function getLastSearch(): Promise<LastSearch | null> {
    if (!(await hasConsent())) return null;
    const raw = await get(COOKIE.LAST_SEARCH);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<LastSearch>;
        return {
            sport_id: typeof parsed.sport_id === "number" ? parsed.sport_id : null,
            city: typeof parsed.city === "string" ? parsed.city : null,
        };
    } catch {
        return null;
    }
}

export async function getRecentFacilities(): Promise<string[]> {
    if (!(await hasConsent())) return [];
    const raw = await get(COOKIE.RECENT_FACILITIES);
    if (!raw) return [];
    return raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
        .slice(0, RECENT_FACILITIES_MAX);
}

export async function getResumeBooking(): Promise<ResumeBooking | null> {
    if (!(await hasConsent())) return null;
    const raw = await get(COOKIE.RESUME_BOOKING);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as ResumeBooking;
        if (!parsed.availability_id || !parsed.facility_id) return null;
        if (parsed.expires_at && new Date(parsed.expires_at).getTime() < Date.now()) return null;
        return parsed;
    } catch {
        return null;
    }
}

export async function getABBucket(): Promise<string | null> {
    return await get(COOKIE.AB_BUCKET);
}
