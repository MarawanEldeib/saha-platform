/**
 * SAH-36: /llms.txt — discovery file for AI crawlers and agents.
 * Format: https://llmstxt.org
 *
 * Points consumers at the OpenAPI spec (SAH-35) and the human-readable
 * facility pages. Update this file whenever the API surface or major
 * features change.
 *
 * SAH-163: URLs derived from NEXT_PUBLIC_APP_URL so preview deploys and
 * future white-label hosts don't leak the production hostname.
 */

import { BRAND_NAME } from "@/lib/constants";

function buildBody(): string {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://sahasports.vercel.app";
    return `# ${BRAND_NAME}

> ${BRAND_NAME} is a UAE-first booking platform for racket sports — Padel, Tennis, Squash, Badminton, and Pickleball. Players discover and book courts; facility owners list their courts and accept payments via Stripe Connect.

The platform supports English and Arabic (RTL). Payments settle in AED with a 90/10 split (owner / platform). Booking confirmations and reminders go via email and WhatsApp.

## API

- [OpenAPI 3.1 spec](${appUrl}/api/openapi.json): machine-readable contract for all REST endpoints
- [API documentation](${appUrl}/docs/API.md): human-readable usage guide with examples
- [MCP server](${appUrl}/api/mcp): hosted Model Context Protocol endpoint for Claude Desktop, Cursor, and Cline

### Read endpoints (public, no auth)

- [List facilities](${appUrl}/api/v1/facilities): filter by sport, city, or geo radius
- [Facility detail](${appUrl}/api/v1/facilities/{id}): UUID or slug; includes hours, sports, photos, ratings
- [Open slots](${appUrl}/api/v1/facilities/{id}/availability): bookable slots for a date

### Write endpoints (auth required, in development)

- POST /api/v1/bookings — create a booking (501 today; tracked in SAH-118)
- GET /api/v1/bookings/{id} — read a booking (501 today; tracked in SAH-118)

## Pages

- [Home](${appUrl}): landing page with featured facilities
- [Facility map](${appUrl}/en/map): interactive map of all active facilities
- [Events](${appUrl}/en/events): upcoming events at facilities
- [Sign in](${appUrl}/en/login): supports email/password and Google OAuth

## Capabilities

- Facility discovery (sport, city, radius)
- Slot availability lookup by date
- Court booking with Stripe Checkout (web flow today, API flow in SAH-118)
- Player loyalty wallet (10 bookings → 1 free hour)
- Group bookings with per-guest split payments
- Reminder emails + WhatsApp messages

## Optional

- [Repository](https://github.com/MarawanEldeib/saha): source code (public)
`;
}

export async function GET() {
    return new Response(buildBody(), {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
    });
}
