/**
 * SAH-37: hosted MCP server.
 *
 * Wraps the public REST API (SAH-35) so Claude Desktop, Cursor, Cline,
 * and any MCP-compatible client can call Saha tools by adding a single
 * URL to their config:
 *
 *   { "mcpServers": { "saha": { "url": "https://sahasports.vercel.app/api/mcp" } } }
 *
 * Why not query Supabase directly here? Single source of truth — the
 * REST routes already enforce Zod validation, RLS, rate limiting, and
 * the geo-search RPC fallback. Re-implementing that in the MCP layer
 * would drift over time. The fetch round-trip is on the same Vercel
 * region, so it's cheap.
 *
 * Why no write tools (create_booking, get_booking) on MCP today?
 * SAH-118 shipped Bearer-JWT auth on the REST API but the MCP ecosystem
 * (Claude Desktop, Cursor, Cline) doesn't yet support per-request
 * Authorization headers in the standard mcpServers config. Without per-
 * caller auth at the MCP layer, a hosted write tool would let any
 * connected client book on someone else's behalf — a no-go.
 *
 * AI agents that need to actually book today should:
 *   1. Use the REST API directly with a Bearer JWT (POST /api/v1/bookings)
 *   2. Or surface the facility's booking URL as a deep link for the user
 *      to complete in a browser
 *
 * When OAuth-for-MCP standardizes (currently in spec discussion), add
 * `create_booking` + `get_booking` here.
 */

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";

// Self-reference the deployment we're running on. NEXT_PUBLIC_APP_URL is
// set per-environment; falls through to production when absent so the
// route still works for ad-hoc previews.
const API_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://sahasports.vercel.app";

// MCP tool responses are { content: [{ type: 'text', text: string }] };
// we forward the JSON body verbatim so the caller can parse it.
async function relay(path: string): Promise<{ content: Array<{ type: "text"; text: string }> }> {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { "User-Agent": "saha-mcp/0.1.0" },
    });
    const text = await res.text();
    return { content: [{ type: "text", text }] };
}

function querystring(params: Record<string, unknown>): string {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
    if (entries.length === 0) return "";
    return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

const handler = createMcpHandler(
    (server) => {
        server.tool(
            "search_facilities",
            "Search active racket-sport facilities in the UAE. Filter by sport (padel, tennis, squash, badminton, pickleball), city (e.g. Dubai), or geo radius (lat+lng+radius_km). Returns name, slug, sports, address, currency, and distance_km when geo is supplied.",
            {
                sport: z.string().optional().describe("Sport name, case-insensitive"),
                city: z.string().optional().describe("City name (e.g. Dubai, Abu Dhabi)"),
                lat: z.number().optional().describe("Latitude in WGS84; pair with lng + radius_km"),
                lng: z.number().optional().describe("Longitude in WGS84"),
                radius_km: z.number().optional().describe("Search radius in km (default 10, max 100)"),
                limit: z.number().int().optional().describe("Page size (default 20, max 100)"),
                offset: z.number().int().optional().describe("Pagination offset"),
            },
            async (args) => relay(`/api/v1/facilities${querystring(args)}`)
        );

        server.tool(
            "get_facility",
            "Fetch a single facility by UUID or slug. Returns full detail including hours, sports, photos, and average rating. 404 if the facility is not active.",
            {
                id: z.string().describe("Facility UUID or slug"),
            },
            async ({ id }) => relay(`/api/v1/facilities/${encodeURIComponent(id)}`)
        );

        server.tool(
            "get_availability",
            "List open (un-booked) court slots at a facility on a given date. Defaults to today (UTC). Optional sport filter when a facility hosts multiple sports.",
            {
                facility_id: z.string().describe("Facility UUID or slug"),
                date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD; defaults to today"),
                sport: z.string().optional().describe("Sport name to filter courts by"),
            },
            async ({ facility_id, ...rest }) =>
                relay(`/api/v1/facilities/${encodeURIComponent(facility_id)}/availability${querystring(rest)}`)
        );
    },
    {},
    {
        basePath: "/api",
        // Vercel Fluid Compute default timeout is 300s, but MCP transport keeps
        // long-poll connections; cap explicitly to avoid runaway sessions.
        maxDuration: 300,
        verboseLogs: false,
    }
);

// SAH-76: wrap the MCP handler so every tool call passes through the
// public_api rate limit. mcp-handler builds its own Response object; we
// just gate the dispatch with a 429 when the caller is over budget.
async function rateLimited(...args: Parameters<typeof handler>): Promise<Response> {
    const rl = await rateLimit("public_api");
    if (!rl.success) {
        return new Response(
            JSON.stringify({ error: "Too many requests", retryAfter: rl.retryAfter }),
            {
                status: 429,
                headers: {
                    "Content-Type": "application/json",
                    "Retry-After": String(rl.retryAfter),
                },
            },
        );
    }
    return handler(...args);
}

// SAH-37 bounce-back: bzo opened the endpoint in a browser and got back
// `{"jsonrpc":"2.0","error":{...},"id":null}`. The MCP Streamable HTTP
// transport uses GET only for server-initiated SSE streams (requires
// `Accept: text/event-stream` + an active session). A bare browser GET
// is not a valid MCP call, but returning a JSON-RPC error reads as a
// broken service. Detect "browser-like" GETs and serve a status page
// instead; real MCP GETs (with the streaming Accept header) still pass
// through to the handler.
function isBrowserGet(req: Request): boolean {
    const accept = req.headers.get("accept") ?? "";
    return !accept.includes("text/event-stream");
}

function statusPageResponse(): Response {
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Saha MCP Server</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; color: #111; }
    h1 { margin: 0 0 4px; font-size: 24px; }
    .ok { color: #059669; font-weight: 600; font-size: 14px; }
    p { line-height: 1.5; color: #374151; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    pre { background: #111827; color: #e5e7eb; padding: 16px; border-radius: 10px; overflow-x: auto; font-size: 13px; line-height: 1.5; }
    ul { padding-left: 20px; line-height: 1.7; }
    a { color: #059669; }
    .small { font-size: 13px; color: #6b7280; }
  </style>
</head>
<body>
  <p class="ok">● Saha MCP server is live</p>
  <h1>Model Context Protocol endpoint</h1>
  <p>
    This URL is not a regular web page — it's a Model Context Protocol server
    designed to be consumed by AI assistants (Claude Desktop, Cursor, Cline, etc.)
    over JSON-RPC. Hitting it in a browser shows this status page; clients connect
    via the Streamable HTTP transport (POST + optional SSE).
  </p>

  <h2>Available tools</h2>
  <ul>
    <li><code>search_facilities</code> — sport / city / geo radius filters</li>
    <li><code>get_facility</code> — by UUID or slug</li>
    <li><code>get_availability</code> — open slots on a given date</li>
  </ul>

  <h2>Connect from Claude Desktop</h2>
  <pre>{
  "mcpServers": {
    "saha": { "url": "${API_BASE}/api/mcp" }
  }
}</pre>
  <p class="small">Add to <code>claude_desktop_config.json</code> and restart Claude. Then try:
  <em>"Find a tennis court in Dubai"</em>.</p>

  <p class="small">Setup walkthrough: <a href="https://github.com/MarawanEldeib/saha/blob/master/docs/MCP.md">docs/MCP.md</a></p>
</body>
</html>`;
    return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}

async function getRoute(req: Request): Promise<Response> {
    if (isBrowserGet(req)) {
        return statusPageResponse();
    }
    return rateLimited(req as Parameters<typeof handler>[0]);
}

export { getRoute as GET, rateLimited as POST, rateLimited as DELETE };
