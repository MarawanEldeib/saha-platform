/**
 * SAH-118: POST /api/v1/bookings
 *
 * Creates a court booking on behalf of an authenticated user and returns
 * a Stripe Checkout URL the caller can redirect to (web) or surface as a
 * link (AI agent). Auth: Bearer JWT or cookie session.
 *
 * Idempotency: callers may pass an `Idempotency-Key` header. We cache the
 * successful response keyed by `(user_id, key)` for 24h via Upstash.
 * Retries with the same key get the cached response — no double-booking.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { Redis } from "@upstash/redis";
import { apiError, apiJson, apiPreflight } from "@/lib/api-response";
import { getApiUser } from "@/lib/api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { bookCourtCore } from "@/lib/booking-flow";

const Body = z.object({
    availability_id: z.string().uuid(),
    num_players: z.number().int().min(1).max(20),
    notes: z.string().max(500).optional(),
    /** Optional wallet credit to apply (in AED). Capped server-side. */
    credit_to_apply: z.number().min(0).optional(),
});

interface IdempotencyEntry {
    booking_id: string;
    checkout_url: string;
    expires_at: number;
    applied_credit: number;
}

let cachedRedis: Redis | null | undefined;
function getRedis(): Redis | null {
    if (cachedRedis !== undefined) return cachedRedis;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        cachedRedis = null;
        return null;
    }
    cachedRedis = new Redis({ url, token });
    return cachedRedis;
}

function appUrlFor(req: NextRequest): string {
    // Prefer NEXT_PUBLIC_APP_URL (set per env in Vercel), fall back to the
    // request host so previews and local dev behave correctly.
    const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
    if (fromEnv) return fromEnv.replace(/\/$/, "");
    const host = req.headers.get("host") ?? "localhost:3000";
    return host.startsWith("localhost") ? `http://${host}` : `https://${host}`;
}

function localeFor(req: NextRequest): string {
    // Allow explicit override via query (`?locale=ar`) so AI clients can
    // hand the user a Checkout in their preferred language. Default to en.
    const q = req.nextUrl.searchParams.get("locale");
    return q === "ar" ? "ar" : "en";
}

export async function OPTIONS() {
    return apiPreflight();
}

export async function POST(req: NextRequest) {
    const auth = await getApiUser(req);
    if (!auth) return apiError("Unauthorized", 401);
    const { supabase, user } = auth;

    // Same policy as the website booking action — 20 / 1h / per user.
    const rl = await rateLimit("booking_create", user.id);
    if (!rl.success) return apiError("Rate limit exceeded", 429, { retry_after: rl.retryAfter });

    let json: unknown;
    try {
        json = await req.json();
    } catch {
        return apiError("Body must be valid JSON", 400);
    }
    const parsed = Body.safeParse(json);
    if (!parsed.success) return apiError("Invalid body", 400, { issues: parsed.error.issues });

    // Idempotency: short-circuit if we already booked this key for this user.
    const idempotencyKey = req.headers.get("idempotency-key") ?? req.headers.get("Idempotency-Key");
    const redis = getRedis();
    const cacheKey = idempotencyKey
        ? `saha:idem:bookings:${user.id}:${idempotencyKey}`
        : null;

    if (cacheKey && redis) {
        try {
            const cached = await redis.get<IdempotencyEntry>(cacheKey);
            if (cached) {
                return apiJson({ data: cached, replayed: true });
            }
        } catch (err) {
            // Don't fail-closed on Redis errors — better to attempt the
            // booking than to lock out a real retry.
            console.warn("[api/bookings] idempotency cache read failed", err);
        }
    }

    const result = await bookCourtCore({
        supabase,
        userId: user.id,
        availabilityId: parsed.data.availability_id,
        numPlayers: parsed.data.num_players,
        creditToApply: parsed.data.credit_to_apply,
        appUrl: appUrlFor(req),
        locale: localeFor(req),
    });

    if (!result.ok) {
        // Map a known "not bookable" error to 409 Conflict; everything else
        // is a 400 (invalid input / not ready facility).
        const status = /no longer available|not yet ready/i.test(result.error) ? 409 : 400;
        return apiError(result.error, status);
    }

    const responseData: IdempotencyEntry = {
        booking_id: result.bookingId,
        checkout_url: result.checkoutUrl,
        expires_at: result.expiresAt,
        applied_credit: result.appliedCredit,
    };

    // Cache the successful response for 24h so retries with the same key
    // return without booking again.
    if (cacheKey && redis) {
        try {
            await redis.set(cacheKey, responseData, { ex: 24 * 60 * 60 });
        } catch (err) {
            console.warn("[api/bookings] idempotency cache write failed", err);
        }
    }

    return apiJson({ data: responseData }, { status: 201 });
}
