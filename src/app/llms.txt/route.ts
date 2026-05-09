/**
 * SAH-36: /llms.txt — discovery file for AI crawlers and agents.
 * Format: https://llmstxt.org
 *
 * Points consumers at the OpenAPI spec (SAH-35) and the human-readable
 * facility pages. Update this file whenever the API surface or major
 * features change.
 */

const body = `# Saha

> Saha is a UAE-first booking platform for racket sports — Padel, Tennis, Squash, Badminton, and Pickleball. Players discover and book courts; facility owners list their courts and accept payments via Stripe Connect.

The platform supports English and Arabic (RTL). Payments settle in AED with a 90/10 split (owner / platform). Booking confirmations and reminders go via email and WhatsApp.

## API

- [OpenAPI 3.0 spec](https://sahasports.vercel.app/api/openapi.json): machine-readable contract for all REST endpoints
- [API documentation](https://sahasports.vercel.app/docs/API.md): human-readable usage guide with examples

### Read endpoints (public, no auth)

- [List facilities](https://sahasports.vercel.app/api/v1/facilities): filter by sport, city, or geo radius
- [Facility detail](https://sahasports.vercel.app/api/v1/facilities/{id}): UUID or slug; includes hours, sports, photos, ratings
- [Open slots](https://sahasports.vercel.app/api/v1/facilities/{id}/availability): bookable slots for a date

### Write endpoints (auth required, in development)

- POST /api/v1/bookings — create a booking (501 today; tracked in SAH-118)
- GET /api/v1/bookings/{id} — read a booking (501 today; tracked in SAH-118)

## Pages

- [Home](https://sahasports.vercel.app): landing page with featured facilities
- [Facility map](https://sahasports.vercel.app/en/map): interactive map of all active facilities
- [Events](https://sahasports.vercel.app/en/events): upcoming events at facilities
- [Sign in](https://sahasports.vercel.app/en/login): supports email/password and Google OAuth

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

export async function GET() {
    return new Response(body, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
    });
}
