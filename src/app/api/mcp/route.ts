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

export { handler as GET, handler as POST, handler as DELETE };
