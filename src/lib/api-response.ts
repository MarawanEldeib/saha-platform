/**
 * SAH-35: shared response helpers for the public REST API.
 *
 * The API is meant to be consumed cross-origin by ChatGPT actions, MCP
 * clients, and third-party integrations — every response gets permissive
 * CORS headers. RLS policies on Supabase enforce access; CORS only loosens
 * the browser-level same-origin rule, not data access.
 */

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
};

export function apiJson<T>(data: T, init?: ResponseInit): NextResponse {
    const res = NextResponse.json(data, init);
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
    return res;
}

export function apiError(message: string, status: number, extra?: Record<string, unknown>): NextResponse {
    return apiJson({ error: message, ...extra }, { status });
}

export function apiPreflight(): NextResponse {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * SAH-155: standard 5xx response that captures the underlying error to
 * Sentry but returns a generic message to the client. Use this anywhere
 * a try/catch or `if (error)` would otherwise risk leaking schema names,
 * SDK internals, or RLS-violation reasons to an anonymous caller.
 *
 * @param err     The error to capture (any shape — Sentry will normalize).
 * @param route   Route tag for filtering in Sentry (e.g. "v1/facilities").
 * @param extra   Optional structured context to attach to the Sentry event.
 *                Never returned to the client.
 */
export function apiServerError(
    err: unknown,
    route: string,
    extra?: Record<string, unknown>,
): NextResponse {
    Sentry.captureException(err, {
        tags: { route },
        extra,
    });
    return apiError("An unexpected error occurred", 500);
}
