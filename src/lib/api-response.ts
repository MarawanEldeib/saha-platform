/**
 * SAH-35: shared response helpers for the public REST API.
 *
 * The API is meant to be consumed cross-origin by ChatGPT actions, MCP
 * clients, and third-party integrations — every response gets permissive
 * CORS headers. RLS policies on Supabase enforce access; CORS only loosens
 * the browser-level same-origin rule, not data access.
 */

import { NextResponse } from "next/server";

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
