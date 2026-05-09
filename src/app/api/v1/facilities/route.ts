/**
 * SAH-35: GET /api/v1/facilities
 *
 * Public read-only listing for AI agents and integrations. RLS enforces
 * `status = 'active'` so unverified facilities never leak.
 *
 * Filters:
 *  - sport=padel|tennis|squash|badminton|pickleball  (case-insensitive)
 *  - city=Dubai
 *  - lat=…&lng=…&radius_km=5  (uses facilities_within_radius RPC)
 *  - limit (default 20, max 100), offset (default 0)
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiError, apiJson, apiPreflight } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";

const Query = z.object({
    sport: z.string().min(1).max(40).optional(),
    city: z.string().min(1).max(80).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radius_km: z.coerce.number().min(0.1).max(100).default(10),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});

interface FacilityRow {
    id: string;
    name: string;
    description: string | null;
    address: string;
    city: string;
    country: string;
    phone: string | null;
    website: string | null;
    location: { coordinates?: [number, number] } | null;
    slug: string | null;
    currency: string | null;
}

interface FacilityWithSports extends FacilityRow {
    facility_sports: { sport_id: number; sports: { name: string } | null }[] | null;
}

function shape(f: FacilityWithSports & { distance_m?: number }) {
    const coords = f.location?.coordinates;
    return {
        id: f.id,
        slug: f.slug,
        name: f.name,
        description: f.description,
        address: f.address,
        city: f.city,
        country: f.country,
        phone: f.phone,
        website: f.website,
        currency: f.currency ?? "AED",
        latitude: coords?.[1] ?? null,
        longitude: coords?.[0] ?? null,
        sports: (f.facility_sports ?? [])
            .map((fs) => fs.sports?.name)
            .filter((n): n is string => Boolean(n)),
        distance_km: typeof f.distance_m === "number" ? Number((f.distance_m / 1000).toFixed(2)) : null,
    };
}

export async function OPTIONS() {
    return apiPreflight();
}

export async function GET(req: NextRequest) {
    const rl = await rateLimit("public_api");
    if (!rl.success) return apiError("Rate limit exceeded", 429, { retry_after: rl.retryAfter });

    const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) {
        return apiError("Invalid query parameters", 400, { issues: parsed.error.issues });
    }
    const { sport, city, lat, lng, radius_km, limit, offset } = parsed.data;

    const supabase = await createClient();

    // Geo path: use the existing facilities_within_radius RPC. The RPC
    // already filters to status='active' and supports a sport_id filter.
    if (lat !== undefined && lng !== undefined) {
        let sportId: number | null = null;
        if (sport) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: s } = await (supabase as any)
                .from("sports").select("id").ilike("name", sport).single();
            sportId = s?.id ?? null;
            if (sportId === null) return apiJson({ data: [], pagination: { total: 0, limit, offset } });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc("facilities_within_radius", {
            lat, lng, radius_km, sport_filter: sportId, discount_only: false,
        });
        if (error) return apiError("Database error", 500, { detail: error.message });

        // RPC returns minimal columns + distance_m. For each, fetch sports list.
        const ids = (data ?? []).map((r: { id: string }) => r.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: full } = await (supabase as any)
            .from("facilities")
            .select("id, name, description, address, city, country, phone, website, location, slug, currency, facility_sports(sport_id, sports(name))")
            .in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
        const byId = new Map<string, FacilityWithSports>(
            (full ?? []).map((f: FacilityWithSports) => [f.id, f])
        );
        const sliced = (data ?? []).slice(offset, offset + limit);
        const shaped = sliced
            .map((r: { id: string; distance_m: number }) => {
                const f = byId.get(r.id);
                return f ? shape({ ...f, distance_m: r.distance_m }) : null;
            })
            .filter((r: ReturnType<typeof shape> | null): r is ReturnType<typeof shape> => r !== null);
        return apiJson({ data: shaped, pagination: { total: data?.length ?? 0, limit, offset } });
    }

    // Non-geo path: filter by city and/or sport. RLS already enforces active.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
        .from("facilities")
        .select("id, name, description, address, city, country, phone, website, location, slug, currency, facility_sports!inner(sport_id, sports!inner(name))", { count: "exact" })
        .eq("status", "active");

    if (city) query = query.ilike("city", city);
    if (sport) query = query.ilike("facility_sports.sports.name", sport);

    query = query.order("name").range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) return apiError("Database error", 500, { detail: error.message });

    return apiJson({
        data: (data ?? []).map((f: FacilityWithSports) => shape(f)),
        pagination: { total: count ?? 0, limit, offset },
    });
}
