/**
 * SAH-157: health endpoint for Vercel monitoring + external uptime
 * checks. Returns 200 when the critical dependencies respond, 503 when
 * any of them are down. Response body is intentionally minimal — no
 * version, no commit hash, no internal hostnames.
 *
 * Checked dependencies:
 *   - Postgres (Supabase): SELECT against a stable, RLS-safe table
 *   - Upstash Redis: PING via the REST client (gracefully skipped when not configured)
 */

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { createClient } from "@/lib/supabase/server";

type CheckResult = "ok" | "fail" | "skipped";

async function checkDb(): Promise<CheckResult> {
    try {
        const supabase = await createClient();
        const { error } = await supabase
            .from("sports")
            .select("id", { head: true, count: "exact" })
            .limit(1);
        return error ? "fail" : "ok";
    } catch {
        return "fail";
    }
}

async function checkRedis(): Promise<CheckResult> {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return "skipped";
    try {
        const redis = new Redis({ url, token });
        const pong = await redis.ping();
        return pong === "PONG" ? "ok" : "fail";
    } catch {
        return "fail";
    }
}

export async function GET(): Promise<NextResponse> {
    const [db, redis] = await Promise.all([checkDb(), checkRedis()]);

    // A "skipped" check (no env wired) is treated as ok — we only want to
    // alert when something we *expect* to work is broken.
    const allOk = db !== "fail" && redis !== "fail";

    return NextResponse.json(
        { status: allOk ? "ok" : "degraded", checks: { db, redis } },
        { status: allOk ? 200 : 503 },
    );
}
