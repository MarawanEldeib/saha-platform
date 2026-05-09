# Saha Public REST API (SAH-35)

Read-only API over facility data and open booking slots. Designed for AI
agents (ChatGPT actions, MCP clients, GPT actions) and third-party
integrations.

- **Base URL**: `https://saha-platform.vercel.app`
- **Versioning**: `/api/v1/...`
- **Auth**: none for read endpoints (RLS enforces access)
- **CORS**: open (`*`) — public data, called from AI agents
- **Rate limit**: 60 requests / minute / IP (sliding window)
- **OpenAPI spec**: [`/api/openapi.json`](https://saha-platform.vercel.app/api/openapi.json)

## Endpoints

| Method | Path | Auth | Status |
|---|---|---|---|
| GET | `/api/v1/facilities` | public | shipped |
| GET | `/api/v1/facilities/{id}` | public | shipped |
| GET | `/api/v1/facilities/{id}/availability` | public | shipped |
| POST | `/api/v1/bookings` | TBD | **501 — SAH-118** |
| GET | `/api/v1/bookings/{id}` | TBD | **501 — SAH-118** |
| GET | `/api/openapi.json` | public | shipped |

`{id}` accepts either a UUID or a slug.

## Examples

### List padel courts in Dubai

```bash
curl 'https://saha-platform.vercel.app/api/v1/facilities?sport=padel&city=Dubai&limit=5'
```

### Find courts within 5 km of a coordinate

```bash
curl 'https://saha-platform.vercel.app/api/v1/facilities?lat=25.0772&lng=55.1389&radius_km=5'
```

Response includes `distance_km` per facility, sorted ascending.

### Get one facility by slug

```bash
curl 'https://saha-platform.vercel.app/api/v1/facilities/dubai-padel-club'
```

### Available slots tomorrow

```bash
curl 'https://saha-platform.vercel.app/api/v1/facilities/dubai-padel-club/availability?date=2026-05-10&sport=padel'
```

## Errors

All errors return JSON with an `error` field and an HTTP status code:

| Status | Meaning |
|---|---|
| 400 | Invalid query parameters (Zod issues are returned in `issues`) |
| 404 | Resource not found |
| 429 | Rate limited (retry after `retry_after` seconds) |
| 500 | Database error |
| 501 | Endpoint exists in the contract but is not yet served |

## Adding new endpoints

1. Create the route under `src/app/api/v1/...`.
2. Use `apiJson`, `apiError`, `apiPreflight` from `src/lib/api-response.ts`
   so CORS headers are consistent.
3. Validate query params with Zod.
4. Call `rateLimit("public_api")` at the top.
5. Update `src/app/api/openapi.json/route.ts` with the new path and any
   new schemas. Bump `info.version` if the change is breaking.
6. Update this file's endpoint table.

## Why no auth on reads

Facility data is already public (the same data is rendered on the public
facility pages and indexed by search engines). The RLS policy
`facilities_select_public` filters to `status='active'`, so unverified
facilities never leak. Adding API keys would be theatre.

Write endpoints (booking creation, fetching a private booking) are a
different matter — those need either Supabase JWT or a user-scoped API
key, and ship in SAH-118.
