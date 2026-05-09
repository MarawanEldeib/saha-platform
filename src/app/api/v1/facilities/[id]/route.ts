/**
 * SAH-35: GET /api/v1/facilities/[id]
 *
 * Returns a single active facility with sports, hours, image URLs, and
 * aggregate review stats. Lookup accepts either a UUID or a slug so the
 * same URLs work as facility-detail pages.
 */

import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, apiJson, apiPreflight } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FacilityFull {
    id: string;
    slug: string | null;
    name: string;
    description: string | null;
    address: string;
    city: string;
    postal_code: string | null;
    country: string;
    phone: string | null;
    website: string | null;
    currency: string | null;
    location: { coordinates?: [number, number] } | null;
    facility_sports: { sports: { name: string } | null }[] | null;
    facility_hours: { day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean }[] | null;
    facility_images: { storage_path: string; display_order: number }[] | null;
}

export async function OPTIONS() { return apiPreflight(); }

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const rl = await rateLimit("public_api");
    if (!rl.success) return apiError("Rate limit exceeded", 429, { retry_after: rl.retryAfter });

    const { id } = await ctx.params;
    const supabase = await createClient();

    const column = UUID_RE.test(id) ? "id" : "slug";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
        .from("facilities")
        .select(`
            id, slug, name, description, address, city, postal_code, country,
            phone, website, currency, location,
            facility_sports(sports(name)),
            facility_hours(day_of_week, open_time, close_time, is_closed),
            facility_images(storage_path, display_order)
        `)
        .eq(column, id)
        .eq("status", "active")
        .maybeSingle();

    if (error) return apiError("Database error", 500, { detail: error.message });
    if (!data) return apiError("Facility not found", 404);

    const f = data as FacilityFull;

    // Aggregate review stats — separate query to keep the main fetch lean.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: reviews } = await (supabase as any)
        .from("reviews").select("rating").eq("facility_id", f.id);
    const ratings: number[] = (reviews ?? []).map((r: { rating: number }) => r.rating);
    const avg = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const imagesPublicBase = `${supabaseUrl}/storage/v1/object/public/facility-images`;
    const images = (f.facility_images ?? [])
        .sort((a, b) => a.display_order - b.display_order)
        .map((img) => `${imagesPublicBase}/${img.storage_path}`);

    const coords = f.location?.coordinates;

    return apiJson({
        data: {
            id: f.id,
            slug: f.slug,
            name: f.name,
            description: f.description,
            address: f.address,
            city: f.city,
            postal_code: f.postal_code,
            country: f.country,
            phone: f.phone,
            website: f.website,
            currency: f.currency ?? "AED",
            latitude: coords?.[1] ?? null,
            longitude: coords?.[0] ?? null,
            sports: (f.facility_sports ?? [])
                .map((fs) => fs.sports?.name)
                .filter((n): n is string => Boolean(n)),
            hours: (f.facility_hours ?? []).map((h) => ({
                day_of_week: h.day_of_week, // 0=Monday
                is_closed: h.is_closed,
                open_time: h.open_time,
                close_time: h.close_time,
            })),
            images,
            ratings: {
                average: avg !== null ? Number(avg.toFixed(2)) : null,
                count: ratings.length,
            },
        },
    });
}
