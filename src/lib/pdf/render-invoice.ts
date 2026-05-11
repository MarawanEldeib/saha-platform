/**
 * SAH-90: server util — render the booking's invoice to a PDF Buffer.
 *
 * Called from the Stripe webhook so the email attachment lands on the
 * confirmation message, but reusable anywhere we need an invoice byte
 * stream (re-send button, admin export, etc.).
 *
 * Idempotent invoice numbering relies on the assign_invoice_number RPC
 * (migration 20260509060000_vat_invoices.sql) — first caller stamps the
 * row, every subsequent call returns the same number.
 *
 * Layout lives in InvoiceDocument.tsx; we just gather data here.
 */

import { format } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { InvoiceDocument, type InvoicePdfData } from "./InvoiceDocument";

const VAT_RATE = 0.05;

export async function renderInvoicePdf(bookingId: string): Promise<{ buffer: Buffer; data: InvoicePdfData } | null> {
    const admin = createAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: booking } = await (admin as any)
        .from("bookings")
        .select(`
            id, date, start_time, end_time, num_players, total_price, currency,
            status, invoice_number, invoiced_at, player_id,
            courts(name, facility_id, facilities(id, name, address, city, country, phone, trn)),
            profiles(display_name, trn)
        `)
        .eq("id", bookingId)
        .single();

    if (!booking) return null;
    const facility = booking.courts?.facilities;
    if (!facility) return null;

    // Stamp the invoice number on first render (idempotent — the RPC
    // returns the existing number on subsequent calls).
    let invoiceNumber: string | null = booking.invoice_number ?? null;
    if (!invoiceNumber) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: assigned } = await (admin as any).rpc("assign_invoice_number", {
            p_booking_id: bookingId,
        });
        invoiceNumber = (assigned as string | null) ?? null;
    }
    if (!invoiceNumber) return null;

    const hasTrn = Boolean(facility.trn);
    const subtotal = Number(booking.total_price);
    const vat = hasTrn ? Math.round(subtotal * VAT_RATE * 100) / 100 : 0;
    const total = subtotal + vat;
    const issuedAtSrc = booking.invoiced_at ? new Date(booking.invoiced_at) : new Date();

    const data: InvoicePdfData = {
        invoiceNumber,
        issuedAt: format(issuedAtSrc, "PP"),
        bookingId: booking.id,
        facility: {
            name: facility.name,
            address: facility.address,
            city: facility.city,
            country: facility.country ?? "",
            phone: facility.phone ?? null,
            trn: facility.trn ?? null,
        },
        player: {
            displayName: booking.profiles?.display_name ?? "Player",
            trn: booking.profiles?.trn ?? null,
        },
        line: {
            courtName: booking.courts?.name ?? "Court",
            facilityName: facility.name,
            date: format(new Date(booking.date), "EEEE, MMMM d, yyyy"),
            timeRange: `${booking.start_time.slice(0, 5)}–${booking.end_time.slice(0, 5)}`,
            numPlayers: booking.num_players ?? 1,
        },
        subtotal,
        vat,
        total,
        currency: booking.currency ?? "AED",
        hasTrn,
    };

    // Dynamic import keeps react-pdf out of the Edge runtime + client bundle.
    const { renderToBuffer } = await import("@react-pdf/renderer");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(InvoiceDocument(data) as any);
    return { buffer, data };
}
