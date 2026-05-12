/**
 * SAH-35: GET /api/v1/facilities/[id]/availability
 *
 * Lists open (un-booked) slots across all active courts at a facility for
 * a given date. Filterable by sport. Default date is today (UTC). RLS makes
 * `court_availability` rows publicly readable.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiError, apiJson, apiPreflight, apiServerError } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Query = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    sport: z.string().min(1).max(40).optional(),
});

interface CourtRow {
    id: string;
    name: string;
    capacity: number;
    price_per_hour: number;
    sports: { name: string } | null;
}

interface AvailabilityRow {
    id: string;
    court_id: string;
    date: string;
    start_time: string;
    end_time: string;
}

export async function OPTIONS() { return apiPreflight(); }

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const rl = await rateLimit("public_api");
    if (!rl.success) return apiError("Rate limit exceeded", 429, { retry_after: rl.retryAfter });

    const { id } = await ctx.params;
    const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return apiError("Invalid query parameters", 400, { issues: parsed.error.issues });

    const date = parsed.data.date ?? new Date().toISOString().slice(0, 10);
    const sport = parsed.data.sport;

    const supabase = await createClient();

    // Resolve facility (UUID or slug) → UUID. RLS rejects inactive facilities.
    const column = UUID_RE.test(id) ? "id" : "slug";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: fac } = await (supabase as any)
        .from("facilities").select("id, currency").eq(column, id).eq("status", "active").maybeSingle();
    if (!fac) return apiError("Facility not found", 404);

    // Fetch the facility's active courts (optionally filtered by sport).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let courtsQuery = (supabase as any)
        .from("courts")
        .select("id, name, capacity, price_per_hour, sports(name)")
        .eq("facility_id", fac.id)
        .eq("is_active", true);
    if (sport) courtsQuery = courtsQuery.ilike("sports.name", sport);

    const { data: courts } = await courtsQuery;
    const courtList: CourtRow[] = (courts ?? []) as CourtRow[];
    if (courtList.length === 0) return apiJson({ data: [], date, facility_id: fac.id });

    const courtIds = courtList.map((c) => c.id);
    const courtMap = new Map(courtList.map((c) => [c.id, c]));

    // Free slots only. court_availability already lives at the slot level —
    // each row is one (court, date, start_time) tuple.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: slots, error } = await (supabase as any)
        .from("court_availability")
        .select("id, court_id, date, start_time, end_time")
        .in("court_id", courtIds)
        .eq("date", date)
        .eq("is_booked", false)
        .order("start_time");
    if (error) return apiServerError(error, "v1/facilities/[id]/availability");

    const shaped = ((slots ?? []) as AvailabilityRow[]).map((s) => {
        const c = courtMap.get(s.court_id);
        return {
            availability_id: s.id,
            court_id: s.court_id,
            court_name: c?.name ?? null,
            sport: c?.sports?.name ?? null,
            capacity: c?.capacity ?? null,
            date: s.date,
            start_time: s.start_time.slice(0, 5),
            end_time: s.end_time.slice(0, 5),
            price_per_hour: c?.price_per_hour ?? null,
            currency: fac.currency ?? "AED",
        };
    });

    return apiJson({ data: shaped, date, facility_id: fac.id });
}
