# Saha Public REST API (SAH-35, SAH-118)

REST API for facility discovery, slot lookup, and court bookings. Designed for AI agents (ChatGPT actions, MCP clients, GPT actions) and third-party integrations.

- **Base URL**: `https://sahasports.vercel.app`
- **Versioning**: `/api/v1/...`
- **Auth**: read endpoints are public; write endpoints require a Bearer JWT or cookie session
- **CORS**: open (`*`)
- **Rate limit (public reads)**: 60 requests / minute / IP
- **Rate limit (booking writes)**: 20 / hour / user
- **OpenAPI spec**: [`/api/openapi.json`](https://sahasports.vercel.app/api/openapi.json)

## Endpoints

| Method | Path | Auth | Status |
|---|---|---|---|
| GET | `/api/v1/facilities` | public | shipped |
| GET | `/api/v1/facilities/{id}` | public | shipped |
| GET | `/api/v1/facilities/{id}/availability` | public | shipped |
| POST | `/api/v1/bookings` | **Bearer or cookie** | shipped (SAH-118) |
| GET | `/api/v1/bookings/{id}` | **Bearer or cookie** | shipped (SAH-118) |
| GET | `/api/openapi.json` | public | shipped |

`{id}` accepts either a UUID or a slug for facilities; UUID only for bookings.

## Authentication

The write endpoints accept either of:

- **`Authorization: Bearer <supabase_access_token>`** — for AI agents, MCP clients, and any external caller
- **Cookie session** — same Supabase session the website uses, lets browser callers hit the API without a separate token flow

To obtain a Supabase access token: complete the standard Supabase Auth flow (email/password sign-in, Google OAuth, etc.). The session response contains `access_token` — that's what goes in the Bearer header.

```bash
# Sign in (replace with your project URL + anon key)
TOKEN=$(curl -s 'https://<your-supabase>.supabase.co/auth/v1/token?grant_type=password' \
  -H 'apikey: <anon-key>' \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"..."}' \
  | jq -r .access_token)
```

## Examples

### Discovery — list padel courts in Dubai

```bash
curl 'https://sahasports.vercel.app/api/v1/facilities?sport=padel&city=Dubai&limit=5'
```

### Discovery — find courts within 5 km of a coordinate

```bash
curl 'https://sahasports.vercel.app/api/v1/facilities?lat=25.0772&lng=55.1389&radius_km=5'
```

Response includes `distance_km` per facility, sorted ascending.

### Discovery — get one facility by slug

```bash
curl 'https://sahasports.vercel.app/api/v1/facilities/cybersport'
```

### Discovery — available slots on a date

```bash
curl 'https://sahasports.vercel.app/api/v1/facilities/cybersport/availability?date=2026-05-12'
```

### Booking — create

```bash
curl -X POST 'https://sahasports.vercel.app/api/v1/bookings' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: client-generated-uuid-v4' \
  -d '{
    "availability_id": "<slot-uuid-from-availability>",
    "num_players": 2,
    "notes": "Sticky court 1 if possible"
  }'
```

Response:

```json
{
  "data": {
    "booking_id": "...",
    "checkout_url": "https://checkout.stripe.com/c/pay/cs_...",
    "expires_at": 1726398900,
    "applied_credit": 0
  }
}
```

Open `checkout_url` in a browser to complete payment. Stripe redirects to the success/cancel URLs back at `sahasports.vercel.app/{locale}/bookings/{id}` after.

### Booking — read

```bash
curl 'https://sahasports.vercel.app/api/v1/bookings/<booking-id>' \
  -H "Authorization: Bearer $TOKEN"
```

## Idempotency

`POST /api/v1/bookings` accepts an `Idempotency-Key` header. The server caches the successful response keyed by `(user_id, key)` for 24 hours. Retries with the same key return `replayed: true` and never double-book.

Recommended: generate a UUID v4 client-side per logical booking attempt. Reuse it on retries.

## Errors

All errors return JSON with an `error` field and an HTTP status:

| Status | Meaning |
|---|---|
| 400 | Invalid query parameters or body (Zod issues in `issues`) |
| 401 | Missing or invalid Authorization (write endpoints) |
| 404 | Resource not found |
| 409 | Slot is no longer available, or facility's Stripe account is incomplete |
| 429 | Rate limited (retry after `retry_after` seconds) |
| 500 | Database error |

## Adding new endpoints

1. Create the route under `src/app/api/v1/...`.
2. Use `apiJson`, `apiError`, `apiPreflight` from `src/lib/api-response.ts` so CORS headers are consistent.
3. Validate inputs with Zod.
4. For write endpoints, call `getApiUser(req)` from `src/lib/api-auth.ts` and 401 on null.
5. Apply the appropriate `rateLimit("...")` policy.
6. Update `src/app/api/openapi.json/route.ts` with the new path and any new schemas. Reference `BearerAuth` under `security` for write endpoints. Bump `info.version` if the change is breaking.
7. Update this file's endpoint table.

## Why this auth model

Reads are genuinely public — the same data renders on facility pages and is indexed by search engines. The RLS policy `facilities_select_public` filters to `status='active'`, so unverified facilities never leak. Adding API keys to read endpoints would be theatre.

Write endpoints need user-scoped auth so RLS can enforce "you can only book as yourself" and "you can only read your own booking." Supabase JWT achieves this without us building a separate API-key system. If we ever need non-Supabase OAuth clients (e.g. enterprise integrations), we'll layer that on top — but Bearer JWT covers GPT actions, MCP, and direct programmatic access today.
