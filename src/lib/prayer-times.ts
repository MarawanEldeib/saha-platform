// SAH-143 Phase A: prayer-aware booking slots.
//
// Fetch Fajr/Dhuhr/Asr/Maghrib/Isha for a given lat/lng + date from the
// public Aladhan API (method 8 = Gulf), cached server-side per request
// via Next's fetch revalidate. The `getBlockedWindows` helper widens
// each prayer to a window (default 20 min) so a slot that touches the
// window is reported as overlapping.

export type PrayerName = "Fajr" | "Dhuhr" | "Asr" | "Maghrib" | "Isha";

export interface PrayerWindow {
    name: PrayerName;
    /** "HH:MM" — local time at the facility (Asia/Dubai for now). */
    start: string;
    end: string;
}

const PRAYER_KEYS: PrayerName[] = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

interface AladhanTimingsResponse {
    data?: {
        timings?: Partial<Record<PrayerName, string>>;
    };
}

function pad(n: number) {
    return String(n).padStart(2, "0");
}

function toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
}

function fromMinutes(min: number): string {
    const wrapped = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
    return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

/**
 * Fetch raw prayer timings (HH:MM) from Aladhan for the given location +
 * date. Returns null if the API is unreachable or returns malformed data.
 *
 * `dateISO` is "YYYY-MM-DD" (the user's selected booking date in facility
 * local time). `lat`/`lng` come from the facility's PostGIS location.
 */
export async function getPrayerTimes(
    lat: number,
    lng: number,
    dateISO: string,
): Promise<Partial<Record<PrayerName, string>> | null> {
    const [yyyy, mm, dd] = dateISO.split("-");
    if (!yyyy || !mm || !dd) return null;
    const url = `https://api.aladhan.com/v1/timings/${dd}-${mm}-${yyyy}?latitude=${lat}&longitude=${lng}&method=8`;
    try {
        const res = await fetch(url, { next: { revalidate: 60 * 60 * 12 } });
        if (!res.ok) return null;
        const json = (await res.json()) as AladhanTimingsResponse;
        const out: Partial<Record<PrayerName, string>> = {};
        for (const k of PRAYER_KEYS) {
            const raw = json.data?.timings?.[k];
            if (raw) out[k] = raw.split(" ")[0];
        }
        if (Object.keys(out).length === 0) return null;
        return out;
    } catch {
        return null;
    }
}

/**
 * Convert prayer timings into widened blocked windows, e.g. ±20 min
 * around the prayer call. A booking slot is considered overlapping if
 * its [start, end) intersects any window.
 */
export function getBlockedWindows(
    timings: Partial<Record<PrayerName, string>>,
    paddingMinutes = 20,
): PrayerWindow[] {
    const out: PrayerWindow[] = [];
    for (const name of PRAYER_KEYS) {
        const t = timings[name];
        if (!t) continue;
        const center = toMinutes(t);
        out.push({
            name,
            start: fromMinutes(center - paddingMinutes),
            end: fromMinutes(center + paddingMinutes),
        });
    }
    return out;
}

/**
 * Return the first prayer window the slot overlaps, or null if it's
 * clear. Half-open intervals: a slot ending exactly at window start is
 * considered clear.
 */
export function findOverlappingWindow(
    slotStart: string,
    slotEnd: string,
    windows: PrayerWindow[],
): PrayerWindow | null {
    const sStart = toMinutes(slotStart);
    const sEnd = toMinutes(slotEnd);
    for (const w of windows) {
        const wStart = toMinutes(w.start);
        const wEnd = toMinutes(w.end);
        if (sStart < wEnd && sEnd > wStart) return w;
    }
    return null;
}
