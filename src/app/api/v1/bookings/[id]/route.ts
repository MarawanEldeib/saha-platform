/**
 * SAH-35: GET /api/v1/bookings/[id] — placeholder.
 *
 * Returns 501 until the write side ships. Same rationale as the POST stub:
 * the contract is in the OpenAPI spec so consumers know it's coming.
 */

import { apiJson, apiPreflight } from "@/lib/api-response";

export async function OPTIONS() { return apiPreflight(); }

export async function GET() {
    return apiJson({
        error: "Not Implemented",
        message: "Reading bookings via API is not yet available.",
        tracked_in: "SAH-118",
    }, { status: 501 });
}
