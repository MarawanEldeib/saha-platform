/**
 * SAH-35: OpenAPI 3.0 spec for the Saha public REST API.
 *
 * Served at /api/openapi.json and /llms.txt (referenced from SAH-36).
 * Hand-authored to keep dependencies minimal; the API surface is small
 * enough that auto-generation from a JSON Schema layer would be heavier
 * than it's worth at this stage.
 *
 * Update checklist when adding/changing endpoints:
 *   1. Edit the corresponding route under src/app/api/v1/.
 *   2. Update the `paths` entry below + any new `components/schemas`.
 *   3. Bump `info.version` if the change is breaking.
 */

import { apiJson, apiPreflight } from "@/lib/api-response";

const spec = {
    openapi: "3.0.3",
    info: {
        title: "Saha Public API",
        version: "0.1.0",
        description:
            "Discover racket-sport facilities and their open booking slots in the UAE. " +
            "Read endpoints are public (no auth). Write endpoints (POST /bookings) are " +
            "stubbed pending SAH-118.",
        contact: { name: "Saha Platform", url: "https://saha-platform.vercel.app" },
    },
    servers: [
        { url: "https://saha-platform.vercel.app", description: "Production" },
    ],
    paths: {
        "/api/v1/facilities": {
            get: {
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
                summary: "Create a booking",
                description: "Not yet implemented. Tracked in SAH-118.",
                responses: { "501": { $ref: "#/components/responses/NotImplemented" } },
            },
        },
        "/api/v1/bookings/{id}": {
            get: {
                summary: "Get a booking",
                description: "Not yet implemented. Tracked in SAH-118.",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
                responses: { "501": { $ref: "#/components/responses/NotImplemented" } },
            },
        },
    },
    components: {
        schemas: {
            FacilitySummary: {
                type: "object",
                properties: {
                    id: { type: "string", format: "uuid" },
                    slug: { type: "string", nullable: true },
                    name: { type: "string" },
                    description: { type: "string", nullable: true },
                    address: { type: "string" },
                    city: { type: "string" },
                    country: { type: "string" },
                    phone: { type: "string", nullable: true },
                    website: { type: "string", nullable: true },
                    currency: { type: "string", example: "AED" },
                    latitude: { type: "number", nullable: true },
                    longitude: { type: "number", nullable: true },
                    sports: { type: "array", items: { type: "string" } },
                    distance_km: { type: "number", nullable: true, description: "Only present when lat/lng are supplied" },
                },
            },
            Facility: {
                allOf: [
                    { $ref: "#/components/schemas/FacilitySummary" },
                    {
                        type: "object",
                        properties: {
                            postal_code: { type: "string", nullable: true },
                            hours: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        day_of_week: { type: "integer", minimum: 0, maximum: 6, description: "0=Monday, 6=Sunday" },
                                        is_closed: { type: "boolean" },
                                        open_time: { type: "string", nullable: true },
                                        close_time: { type: "string", nullable: true },
                                    },
                                },
                            },
                            images: { type: "array", items: { type: "string", format: "uri" } },
                            ratings: {
                                type: "object",
                                properties: {
                                    average: { type: "number", nullable: true, minimum: 1, maximum: 5 },
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
                    court_name: { type: "string", nullable: true },
                    sport: { type: "string", nullable: true },
                    capacity: { type: "integer", nullable: true },
                    date: { type: "string", format: "date" },
                    start_time: { type: "string", example: "18:00" },
                    end_time: { type: "string", example: "19:00" },
                    price_per_hour: { type: "number", nullable: true },
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
            Error: {
                type: "object",
                properties: { error: { type: "string" } },
                required: ["error"],
            },
        },
        responses: {
            BadRequest: {
                description: "Invalid query parameters",
                content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
            },
            NotFound: {
                description: "Resource not found",
                content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
            },
            RateLimited: {
                description: "Too many requests; check the retry_after field",
                content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
            },
            NotImplemented: {
                description: "Endpoint exists in the contract but is not yet served",
                content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
            },
        },
    },
} as const;

export async function OPTIONS() { return apiPreflight(); }

export async function GET() {
    return apiJson(spec);
}
