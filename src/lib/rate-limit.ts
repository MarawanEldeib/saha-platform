/**
 * SAH-76: Upstash-backed rate limiting. Falls through cleanly when env
 * vars aren't set so non-prod environments aren't blocked. Each key uses a
 * sliding window — better burst behaviour than fixed-window for our load.
 *
 * Observability: every blocked request and every backend error is forwarded
 * to Sentry (as `warning` / `error` respectively). Production ops can then
 * filter on `policy` tags to spot abuse patterns.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";

let cachedRedis: Redis | null | undefined;
function getRedis(): Redis | null {
    if (cachedRedis !== undefined) return cachedRedis;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        cachedRedis = null;
        if (process.env.NODE_ENV === "production") {
            console.warn("[rate-limit] Upstash env vars missing — rate limiting disabled");
        }
        return null;
    }
    cachedRedis = new Redis({ url, token });
    return cachedRedis;
}

const limiters = new Map<string, Ratelimit>();
function getLimiter(name: string, points: number, windowSec: number): Ratelimit | null {
    const redis = getRedis();
    if (!redis) return null;
    let l = limiters.get(name);
    if (!l) {
        l = new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(points, `${windowSec} s`),
            analytics: true,
            prefix: `saha:rl:${name}`,
        });
        limiters.set(name, l);
    }
    return l;
}

async function callerKey(prefix: string, suffix?: string): Promise<string> {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? h.get("x-real-ip")
        ?? "unknown";
    return suffix ? `${prefix}:${ip}:${suffix}` : `${prefix}:${ip}`;
}

export interface RateLimitResult {
    /** True when the call is permitted (or limiting is disabled). */
    success: boolean;
    /** Seconds until the next attempt is allowed; 0 when allowed. */
    retryAfter: number;
}

const POLICIES = {
    auth_login: { points: 5, windowSec: 15 * 60 },          // 5 / 15 min / IP
    auth_signup: { points: 3, windowSec: 60 * 60 },         // 3 / 1 h / IP
    auth_forgot: { points: 3, windowSec: 60 * 60 },         // 3 / 1 h / IP
    booking_create: { points: 20, windowSec: 60 * 60 },     // 20 / 1 h / IP
    review_submit: { points: 5, windowSec: 60 * 60 },       // 5 / 1 h / IP
    public_api: { points: 60, windowSec: 60 },              // 60 / 1 min / IP — generous for AI agents (SAH-35)
    messages_send: { points: 30, windowSec: 60 * 60 },      // 30 / 1 h / IP — matchmaking DM spam guard (SAH-96)
    phone_otp_per_phone: { points: 3, windowSec: 60 * 60 }, // 3 / 1 h / phone — SAH-79
    phone_otp_per_user: { points: 5, windowSec: 24 * 60 * 60 }, // 5 / 24 h / user — SAH-79
} as const;

export type RatePolicy = keyof typeof POLICIES;

function reportBlocked(policy: RatePolicy, retryAfter: number, keyKind: "ip" | "owner") {
    Sentry.captureMessage(`rate-limit blocked: ${policy}`, {
        level: "warning",
        tags: { policy, key_kind: keyKind },
        extra: { retryAfter },
    });
}

function reportBackendError(policy: RatePolicy, err: unknown) {
    // Backend (Upstash) hiccup — we still allow the request to keep the
    // site working, but flag for ops so an outage doesn't go unnoticed.
    console.warn("[rate-limit] backend error, allowing request", err);
    Sentry.captureException(err, {
        level: "error",
        tags: { policy, kind: "rate_limit_backend_error" },
    });
}

export async function rateLimit(policy: RatePolicy, suffix?: string): Promise<RateLimitResult> {
    const cfg = POLICIES[policy];
    const limiter = getLimiter(policy, cfg.points, cfg.windowSec);
    if (!limiter) {
        return { success: true, retryAfter: 0 };
    }
    const key = await callerKey(policy, suffix);
    try {
        const { success, reset } = await limiter.limit(key);
        const retryAfter = success ? 0 : Math.max(0, Math.ceil((reset - Date.now()) / 1000));
        if (!success) reportBlocked(policy, retryAfter, "ip");
        return { success, retryAfter };
    } catch (err) {
        // Don't fail-closed on Upstash errors — better to serve the request
        // than to lock out real users when the rate-limit backend hiccups.
        reportBackendError(policy, err);
        return { success: true, retryAfter: 0 };
    }
}

// SAH-79: per-phone and per-user OTP throttles need a key that ISN'T tied
// to the caller's IP — same phone from different IPs still consumes the
// same budget. This variant uses the supplied ownerKey directly.
export async function rateLimitByOwnerKey(policy: RatePolicy, ownerKey: string): Promise<RateLimitResult> {
    const cfg = POLICIES[policy];
    const limiter = getLimiter(policy, cfg.points, cfg.windowSec);
    if (!limiter) {
        return { success: true, retryAfter: 0 };
    }
    try {
        const { success, reset } = await limiter.limit(`${policy}:owner:${ownerKey}`);
        const retryAfter = success ? 0 : Math.max(0, Math.ceil((reset - Date.now()) / 1000));
        if (!success) reportBlocked(policy, retryAfter, "owner");
        return { success, retryAfter };
    } catch (err) {
        reportBackendError(policy, err);
        return { success: true, retryAfter: 0 };
    }
}
