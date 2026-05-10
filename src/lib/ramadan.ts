// SAH-146: Ramadan-aware UI. Two pieces:
//   1. Whether today falls within Ramadan (driven by a hand-curated table
//      of Hijri-to-Gregorian observed start/end dates for the UAE — Hijri
//      months depend on moon sighting, so a static table is more reliable
//      than a runtime conversion library).
//   2. Today's Suhoor (Fajr) and Iftar (Maghrib) times for Dubai, fetched
//      from the public Aladhan API and cached server-side per day.

// Observed start/end of Ramadan in the UAE (Asr al-Maghrib region).
// Update once per year when the moon sighting confirms next year's date.
// Source: https://www.moonsighting.com/ + UAE General Authority of Islamic Affairs.
const RAMADAN_RANGES_UAE: Array<{ start: string; end: string }> = [
    { start: "2025-02-28", end: "2025-03-29" }, // 1446 AH
    { start: "2026-02-17", end: "2026-03-18" }, // 1447 AH
    { start: "2027-02-07", end: "2027-03-08" }, // 1448 AH
    { start: "2028-01-27", end: "2028-02-25" }, // 1449 AH
];

export function isRamadanToday(now: Date = new Date()): boolean {
    const today = now.toISOString().slice(0, 10);
    return RAMADAN_RANGES_UAE.some((r) => today >= r.start && today <= r.end);
}

export interface RamadanTimings {
    suhoor: string; // "HH:MM" 24h, Asia/Dubai
    iftar: string;
}

interface AladhanResponse {
    data?: {
        timings?: { Fajr?: string; Maghrib?: string };
    };
}

// Fetch Fajr/Maghrib for Dubai for a given date (DD-MM-YYYY) from Aladhan.
// Method 8 = Gulf Region. The response is plain JSON, no auth.
async function fetchTimings(date: Date): Promise<RamadanTimings | null> {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    const url = `https://api.aladhan.com/v1/timingsByCity/${dd}-${mm}-${yyyy}?city=Dubai&country=AE&method=8`;

    try {
        const res = await fetch(url, { next: { revalidate: 60 * 60 * 12 } });
        if (!res.ok) return null;
        const json = (await res.json()) as AladhanResponse;
        const fajr = json.data?.timings?.Fajr;
        const maghrib = json.data?.timings?.Maghrib;
        if (!fajr || !maghrib) return null;
        // Aladhan returns "HH:MM (TZ)" — strip the suffix.
        return {
            suhoor: fajr.split(" ")[0],
            iftar: maghrib.split(" ")[0],
        };
    } catch {
        return null;
    }
}

export async function getRamadanTimingsForToday(): Promise<RamadanTimings | null> {
    if (!isRamadanToday()) return null;
    return fetchTimings(new Date());
}
