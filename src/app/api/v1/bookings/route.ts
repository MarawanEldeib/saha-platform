/**
 * SAH-35: POST /api/v1/bookings — placeholder.
 *
 * Returns 501 until the write side ships. Tracked in a follow-up ticket;
 * the OpenAPI spec advertises this endpoint so AI agents see the contract
 * and can plan around it (search-only flows for now).
 */

import { apiJson, apiPreflight } from "@/lib/api-response";

export async function OPTIONS() { return apiPreflight(); }

export async function POST() {
    return apiJson({
        error: "Not Implemented",
        message: "Booking creation via API is not yet available. Use the web app at https://saha-platform.vercel.app to book.",
        tracked_in: "SAH-118",
    }, { status: 501 });
}
