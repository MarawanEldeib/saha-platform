/**
 * Mapbox Geocoding v5 wrapper. Returns a discriminated result so callers can
 * distinguish "address didn't resolve" (user-correctable) from "Mapbox isn't
 * configured" (env issue, dev-only). Server actions use this before saving
 * a facility's address so we don't end up with rows whose `location IS NULL`
 * (which silently break the map and radius search — SAH-119).
 */

import { getActiveRegion } from "@/lib/regions";

export type GeocodeResult =
    | { status: "ok"; wkt: string }
    | { status: "no_match" }
    | { status: "not_configured" };

export async function geocodeAddress(address: string, city: string): Promise<GeocodeResult> {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return { status: "not_configured" };
    const region = getActiveRegion();
    const query = encodeURIComponent(`${address}, ${city}, ${region.displayName}`);
    try {
        const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${token}&limit=1&country=${region.geocodingCountry}`,
            { signal: AbortSignal.timeout(5000) },
        );
        if (!res.ok) return { status: "no_match" };
        const data = await res.json() as { features?: { geometry?: { type: string; coordinates: [number, number] } }[] };
        const coords = data.features?.[0]?.geometry?.coordinates;
        if (!coords) return { status: "no_match" };
        return { status: "ok", wkt: `POINT(${coords[0]} ${coords[1]})` };
    } catch {
        return { status: "no_match" };
    }
}
