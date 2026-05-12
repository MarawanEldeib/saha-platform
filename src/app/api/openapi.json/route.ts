/**
 * SAH-35 / SAH-38: OpenAPI 3.1 spec for the Saha public REST API.
 *
 * Served at /api/openapi.json. Consumed by the Saha Custom GPT (SAH-38)
 * and any other AI agent that imports the schema. Hand-authored to keep
 * dependencies minimal.
 *
 * Update checklist when adding/changing endpoints:
 *   1. Edit the corresponding route under src/app/api/v1/.
 *   2. Add/update the `paths` entry below + any `components/schemas`.
 *   3. Give every operation a unique camelCase `operationId` so downstream
 *      tools render it cleanly (avoids OpenAI auto-naming like
 *      `get_api_v1_facilities`).
 *   4. Bump `info.version` if the change is breaking.
 *
 * 3.1 vs 3.0: nullable fields use the JSON-Schema 2020-12 form
 * `type: ["string", "null"]`. The deprecated `nullable: true` keyword
 * is invalid in 3.1.
 */

import { apiJson, apiPreflight, apiError } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";

const spec = {
    openapi: "3.1.0",
    info: {
        title: "Saha Public API",
        version: "0.2.0",
        description:
            "Discover racket-sport facilities, list open slots, and book courts in the UAE. " +
            "Read endpoints are public (no auth). Write endpoints require a Supabase JWT " +
            "in the Authorization header (Bearer token) — same token issued by Supabase " +
            "Auth on sign-in.",
        contact: { name: "Saha", url: "https://sahasports.vercel.app" },
    },
    servers: [
        { url: "https://sahasports.vercel.app", description: "Production" },
    ],
    paths: {
        "/api/v1/facilities": {
            get: {
                operationId: "listFacilities",
                summary: "List active facilities",
                description:
                    "Public listing. Provide `lat`+`lng` for distance-sorted radius search; " +
                    "otherwise results are sorted alphabetically.",
                parameters: [
                    { name: "sport", in: "query", schema: { type: "string", example: "padel" }, description: "Sport name (case-insensitive)" },
                    { name: "city", in: "query", schema: { type: "string", example: "Dubai" } },
                    { name: "lat", in: "query", schema: { type: "number", format: "double" }, description: "Latitude in WGS84. Pair with lng+radius_km." },
                    { name: "lng", in: "query", schema: { type: "number", format: "double" } },
                    { name: "radius_km", in: "query", schema: { type: "number", default: 10, minimum: 0.1, maximum: 100 } },
                    { name: "limit", in: "query", schema: { type: "integer", default: 20, minimum: 1, maximum: 100 } },
                    { name: "offset", in: "query", schema: { type: "integer", default: 0, minimum: 0 } },
                ],
                responses: {
                    "200": {
                        description: "Paginated list of facilities",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        data: { type: "array", items: { $ref: "#/components/schemas/FacilitySummary" } },
                                        pagination: { $ref: "#/components/schemas/Pagination" },
                                    },
                                },
                            },
                        },
                    },
                    "400": { $ref: "#/components/responses/BadRequest" },
                    "429": { $ref: "#/components/responses/RateLimited" },
                },
            },
        },
        "/api/v1/facilities/{id}": {
            get: {
                operationId: "getFacility",
                summary: "Get one facility",
                description: "Lookup by UUID or slug. Inactive facilities return 404.",
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Facility UUID or slug" },
                ],
                responses: {
                    "200": {
                        description: "Facility detail",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: { data: { $ref: "#/components/schemas/Facility" } },
                                },
                            },
                        },
                    },
                    "404": { $ref: "#/components/responses/NotFound" },
                },
            },
        },
        "/api/v1/facilities/{id}/availability": {
            get: {
                operationId: "getFacilityAvailability",
                summary: "List open slots at a facility",
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                    { name: "date", in: "query", schema: { type: "string", format: "date", example: "2026-05-12" }, description: "YYYY-MM-DD; defaults to today (UTC)" },
                    { name: "sport", in: "query", schema: { type: "string" } },
                ],
                responses: {
                    "200": {
                        description: "Open slots for the given date",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        data: { type: "array", items: { $ref: "#/components/schemas/Slot" } },
                                        date: { type: "string", format: "date" },
                                        facility_id: { type: "string", format: "uuid" },
                                    },
                                },
                            },
                        },
                    },
                    "404": { $ref: "#/components/responses/NotFound" },
                },
            },
        },
        "/api/v1/bookings": {
            post: {
                operationId: "createBooking",
                summary: "Create a booking and start Stripe Checkout",
                description:
                    "Locks the requested slot, creates a pending booking, and returns a Stripe " +
                    "Checkout URL the caller should open in a browser to complete payment. " +
                    "Slot lock is via conditional update on `is_booked` — concurrent calls for " +
                    "the same slot get a 409. Pass an `Idempotency-Key` header to make retries " +
                    "safe; the same key returns the cached response for 24 hours.",
                security: [{ BearerAuth: [] }],
                parameters: [
                    {
                        name: "Idempotency-Key",
                        in: "header",
                        required: false,
                        schema: { type: "string", maxLength: 100 },
                        description: "Caller-supplied key. Same key = same response replayed.",
                    },
                    {
                        name: "locale",
                        in: "query",
                        required: false,
                        schema: { type: "string", enum: ["en", "ar"] },
                        description: "Locale for the Stripe Checkout return URLs. Defaults to en.",
                    },
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/CreateBookingRequest" },
                        },
                    },
                },
                responses: {
                    "201": {
                        description: "Booking created; redirect the user to checkout_url.",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        data: { $ref: "#/components/schemas/BookingCheckout" },
                                        replayed: { type: "boolean", description: "True when the response is from idempotency cache." },
                                    },
                                },
                            },
                        },
                    },
                    "400": { $ref: "#/components/responses/BadRequest" },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "409": { $ref: "#/components/responses/Conflict" },
                    "429": { $ref: "#/components/responses/RateLimited" },
                },
            },
        },
        "/api/v1/bookings/{id}": {
            get: {
                operationId: "getBooking",
                summary: "Get one booking by id",
                description:
                    "Returns a single booking. RLS limits visibility to the player who booked it, " +
                    "the facility owner, and admins.",
                security: [{ BearerAuth: [] }],
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
                responses: {
                    "200": {
                        description: "Booking detail",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: { data: { $ref: "#/components/schemas/Booking" } },
                                },
                            },
                        },
                    },
                    "401": { $ref: "#/components/responses/Unauthorized" },
                    "404": { $ref: "#/components/responses/NotFound" },
                },
            },
        },
    },
    components: {
        schemas: {
            FacilitySummary: {
                type: "object",
                properties: {
                    id: { type: "string", format: "uuid" },
                    slug: { type: ["string", "null"] },
                    name: { type: "string" },
                    description: { type: ["string", "null"] },
                    address: { type: "string" },
                    city: { type: "string" },
                    country: { type: "string" },
                    phone: { type: ["string", "null"] },
                    website: { type: ["string", "null"] },
                    currency: { type: "string", example: "AED" },
                    latitude: { type: ["number", "null"] },
                    longitude: { type: ["number", "null"] },
                    sports: { type: "array", items: { type: "string" } },
                    distance_km: { type: ["number", "null"], description: "Only present when lat/lng are supplied" },
                },
            },
            Facility: {
                allOf: [
                    { $ref: "#/components/schemas/FacilitySummary" },
                    {
                        type: "object",
                        properties: {
                            postal_code: { type: ["string", "null"] },
                            hours: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        day_of_week: { type: "integer", minimum: 0, maximum: 6, description: "0=Monday, 6=Sunday" },
                                        is_closed: { type: "boolean" },
                                        open_time: { type: ["string", "null"] },
                                        close_time: { type: ["string", "null"] },
                                    },
                                },
                            },
                            images: { type: "array", items: { type: "string", format: "uri" } },
                            ratings: {
                                type: "object",
                                properties: {
                                    average: { type: ["number", "null"], minimum: 1, maximum: 5 },
                                    count: { type: "integer", minimum: 0 },
                                },
                            },
                        },
                    },
                ],
            },
            Slot: {
                type: "object",
                properties: {
                    availability_id: { type: "string", format: "uuid" },
                    court_id: { type: "string", format: "uuid" },
                    court_name: { type: ["string", "null"] },
                    sport: { type: ["string", "null"] },
                    capacity: { type: ["integer", "null"] },
                    date: { type: "string", format: "date" },
                    start_time: { type: "string", example: "18:00" },
                    end_time: { type: "string", example: "19:00" },
                    price_per_hour: { type: ["number", "null"] },
                    currency: { type: "string", example: "AED" },
                },
            },
            Pagination: {
                type: "object",
                properties: {
                    total: { type: "integer", minimum: 0 },
                    limit: { type: "integer", minimum: 1 },
                    offset: { type: "integer", minimum: 0 },
                },
            },
            CreateBookingRequest: {
                type: "object",
                required: ["availability_id", "num_players"],
                properties: {
                    availability_id: { type: "string", format: "uuid", description: "Slot id from getFacilityAvailability" },
                    num_players: { type: "integer", minimum: 1, maximum: 20 },
                    notes: { type: ["string", "null"], maxLength: 500 },
                    credit_to_apply: { type: "number", minimum: 0, description: "Optional wallet credit (capped server-side)" },
                },
            },
            BookingCheckout: {
                type: "object",
                properties: {
                    booking_id: { type: "string", format: "uuid" },
                    checkout_url: { type: "string", format: "uri", description: "Open this URL in a browser to complete payment via Stripe." },
                    expires_at: { type: "integer", description: "Unix seconds. The Stripe Checkout session expires at this time (~30 min)." },
                    applied_credit: { type: "number", description: "Wallet credit actually applied (capped at the platform fee)." },
                },
            },
            Booking: {
                type: "object",
                properties: {
                    id: { type: "string", format: "uuid" },
                    date: { type: "string", format: "date" },
                    start_time: { type: "string", example: "18:00" },
                    end_time: { type: "string", example: "19:00" },
                    num_players: { type: "integer" },
                    total_price: { type: "number" },
                    currency: { type: "string", example: "AED" },
                    status: { type: "string", enum: ["pending", "confirmed", "cancelled", "completed", "no_show"] },
                    qr_code_token: { type: "string", format: "uuid" },
                    notes: { type: ["string", "null"] },
                    created_at: { type: "string", format: "date-time" },
                    court: {
                        type: ["object", "null"],
                        properties: {
                            id: { type: "string", format: "uuid" },
                            name: { type: "string" },
                            sport: { type: ["string", "null"] },
                        },
                    },
                    payment: {
                        type: ["object", "null"],
                        properties: {
                            status: { type: "string", enum: ["pending", "succeeded", "failed", "refunded"] },
                            amount: { type: "number" },
                            currency: { type: "string" },
                            checkout_session_id: { type: ["string", "null"] },
                        },
                    },
                },
            },
            Error: {
                type: "object",
                properties: { error: { type: "string" } },
                required: ["error"],
            },
        },
        securitySchemes: {
            BearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
                description: "Supabase access token. Obtain via the Supabase Auth flow (sign-in returns access_token). Pass as `Authorization: Bearer <token>`.",
            },
        },
        responses: {
            BadRequest: {
                description: "Invalid query parameters or body",
                content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
            },
            Unauthorized: {
                description: "Missing or invalid Authorization header / cookie session",
                content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
            },
            NotFound: {
                description: "Resource not found",
                content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
            },
            Conflict: {
                description: "Slot is no longer available, or facility is not yet ready to receive payments",
                content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
            },
            RateLimited: {
                description: "Too many requests; check the retry_after field",
                content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
            },
        },
    },
} as const;

export async function OPTIONS() { return apiPreflight(); }

export async function GET() {
    // SAH-76: this spec is hit by every Custom GPT discovery request — cap
    // per-IP so a misbehaving agent can't loop on us.
    const rl = await rateLimit("public_api");
    if (!rl.success) return apiError("Too many requests", 429, { retryAfter: rl.retryAfter });
    return apiJson(spec);
}
