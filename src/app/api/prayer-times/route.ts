// SAH-143 Phase A: server-side fetch for prayer-aware booking slots.
//
// The BookingWidget calls this endpoint with the facility id + selected
// date. We resolve lat/lng server-side (so the client never sees the
// raw GIS row) and proxy to Aladhan with a daily cache.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPrayerTimes, getBlockedWindows, type PrayerWindow } from "@/lib/prayer-times";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
    // SAH-76: public endpoint that proxies to Aladhan — must throttle so a
    // caller can't burn their fair share of our upstream budget.
    const rl = await rateLimit("public_api");
    if (!rl.success) {
        return NextResponse.json(
            { error: "Too many requests", retryAfter: rl.retryAfter },
            { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
        );
    }

    const url = new URL(request.url);
    const facilityId = url.searchParams.get("facility_id");
    const date = url.searchParams.get("date");

    if (!facilityId || !date) {
        return NextResponse.json({ error: "facility_id and date required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: facility } = await supabase
        .from("facilities")
        .select("location")
        .eq("id", facilityId)
        .eq("status", "active")
        .maybeSingle();

    if (!facility) return NextResponse.json({ error: "Facility not found" }, { status: 404 });

    const coords = (facility.location as { type?: string; coordinates?: [number, number] } | null)?.coordinates;
    if (!coords || coords.length !== 2) {
        return NextResponse.json({ windows: [] as PrayerWindow[] });
    }

    const [lng, lat] = coords;
    const timings = await getPrayerTimes(lat, lng, date);
    if (!timings) return NextResponse.json({ windows: [] as PrayerWindow[] });

    return NextResponse.json({ windows: getBlockedWindows(timings) });
}
