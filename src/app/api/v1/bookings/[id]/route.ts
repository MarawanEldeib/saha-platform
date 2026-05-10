/**
 * SAH-118: GET /api/v1/bookings/{id}
 *
 * Returns one booking owned by the authenticated user. RLS already
 * restricts visibility to player_id = auth.uid() OR facility owners /
 * admins, so we don't need to repeat the check at the API layer.
 *
 * Auth: Bearer JWT or cookie session.
 */

import type { NextRequest } from "next/server";
import { apiError, apiJson, apiPreflight } from "@/lib/api-response";
import { getApiUser } from "@/lib/api-auth";

interface BookingRow {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    num_players: number;
    total_price: number;
    currency: string;
    status: string;
    qr_code_token: string;
    notes: string | null;
    created_at: string;
    courts: { id: string; name: string; sports: { name: string } | null } | null;
    payments: { status: string; amount: number; currency: string; stripe_checkout_session_id: string | null }[] | null;
}

export async function OPTIONS() {
    return apiPreflight();
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const auth = await getApiUser(req);
    if (!auth) return apiError("Unauthorized", 401);
    const { supabase } = auth;

    const { id } = await ctx.params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
        .from("bookings")
        .select(`
            id, date, start_time, end_time, num_players, total_price, currency,
            status, qr_code_token, notes, created_at,
            courts(id, name, sports(name)),
            payments(status, amount, currency, stripe_checkout_session_id)
        `)
        .eq("id", id)
        .maybeSingle();

    if (error) return apiError("Database error", 500, { detail: error.message });
    if (!data) return apiError("Booking not found", 404);

    const b = data as BookingRow;
    const payment = b.payments?.[0] ?? null;

    return apiJson({
        data: {
            id: b.id,
            date: b.date,
            start_time: b.start_time.slice(0, 5),
            end_time: b.end_time.slice(0, 5),
            num_players: b.num_players,
            total_price: Number(b.total_price),
            currency: b.currency,
            status: b.status,
            qr_code_token: b.qr_code_token,
            notes: b.notes,
            created_at: b.created_at,
            court: b.courts ? {
                id: b.courts.id,
                name: b.courts.name,
                sport: b.courts.sports?.name ?? null,
            } : null,
            payment: payment ? {
                status: payment.status,
                amount: Number(payment.amount),
                currency: payment.currency,
                checkout_session_id: payment.stripe_checkout_session_id,
            } : null,
        },
    });
}
