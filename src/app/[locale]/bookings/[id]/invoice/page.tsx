import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect, notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { format } from "date-fns";
import { formatPrice } from "@/lib/utils";
import { PrintInvoiceButton } from "./PrintInvoiceButton";

export const metadata = { title: "Invoice — Saha" };

interface InvoiceData {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    num_players: number;
    total_price: number;
    currency: string;
    status: string;
    invoice_number: string | null;
    invoiced_at: string | null;
    courts: {
        name: string;
        facilities: {
            id: string;
            name: string;
            address: string;
            city: string;
            country: string;
            phone: string | null;
            website: string | null;
            trn: string | null;
        } | null;
    } | null;
    profiles: {
        display_name: string | null;
        trn: string | null;
    } | null;
}

const VAT_RATE = 0.05;

export default async function InvoicePage({ params }: { params: Promise<{ id: string; locale: string }> }) {
    const { id } = await params;
    const locale = await getLocale();
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
        .from("bookings")
        .select(`
            id, date, start_time, end_time, num_players, total_price, currency,
            status, invoice_number, invoiced_at, player_id,
            courts(name, facility_id, facilities(id, name, address, city, country, phone, website, trn)),
            profiles(display_name, trn)
        `)
        .eq("id", id)
        .single();

    const booking = data as (InvoiceData & { player_id: string }) | null;
    if (!booking) notFound();

    // Only the player or the facility owner (or admin) may view the invoice.
    if (booking.player_id !== user.id) {
        const facilityOwnerCheck = await supabase
            .from("facilities")
            .select("owner_id")
            .eq("id", booking.courts?.facilities?.id ?? "")
            .single();
        const ownerId = (facilityOwnerCheck.data as { owner_id: string } | null)?.owner_id;
        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();
        const role = (profile as { role: string } | null)?.role;
        if (ownerId !== user.id && role !== "admin") {
            redirect(`/${locale}/bookings`);
        }
    }

    // Only confirmed/completed bookings warrant an invoice.
    if (!["confirmed", "completed"].includes(booking.status)) {
        redirect(`/${locale}/bookings/${id}`);
    }

    // Assign a sequential invoice number on first view (idempotent).
    let invoiceNumber = booking.invoice_number;
    if (!invoiceNumber) {
        const admin = createAdminClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: assigned } = await (admin as any).rpc("assign_invoice_number", {
            p_booking_id: id,
        });
        invoiceNumber = (assigned as string | null) ?? null;
    }

    const facility = booking.courts?.facilities;
    const hasTrn = Boolean(facility?.trn);
    const subtotal = Number(booking.total_price);
    const vat = hasTrn ? Math.round(subtotal * VAT_RATE * 100) / 100 : 0;
    const total = subtotal + vat;
    const issuedAt = booking.invoiced_at ? new Date(booking.invoiced_at) : new Date();

    return (
        <div className="bg-gray-100 dark:bg-gray-950 min-h-screen py-8 print:bg-white print:p-0">
            <div className="max-w-3xl mx-auto px-6">
                <div className="flex justify-between items-center mb-4 print:hidden">
                    <a
                        href={`/${locale}/bookings/${id}`}
                        className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
                    >
                        ← Back to booking
                    </a>
                    <PrintInvoiceButton />
                </div>

                <article className="bg-white text-gray-900 rounded-2xl shadow-sm p-10 print:shadow-none print:rounded-none print:p-8">
                    {/* Header */}
                    <header className="flex justify-between items-start border-b border-gray-200 pb-6 mb-6">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">
                                {hasTrn ? "Tax Invoice" : "Invoice"}
                            </h1>
                            <p className="text-xs text-gray-500 mt-1">
                                {invoiceNumber ?? "—"} · Issued {format(issuedAt, "PP")}
                            </p>
                        </div>
                        <div className="text-end text-sm text-gray-600">
                            <p className="font-semibold text-gray-900 text-base">Saha</p>
                            <p>saha.ae</p>
                        </div>
                    </header>

                    {/* From / To */}
                    <section className="grid grid-cols-2 gap-6 mb-8 text-sm">
                        <div>
                            <p className="text-xs uppercase text-gray-500 mb-1">Issued by</p>
                            <p className="font-semibold text-gray-900">{facility?.name}</p>
                            <p className="text-gray-700">{facility?.address}</p>
                            <p className="text-gray-700">{facility?.city}{facility?.country ? `, ${facility.country}` : ""}</p>
                            {facility?.phone && <p className="text-gray-700">{facility.phone}</p>}
                            {facility?.trn && (
                                <p className="text-gray-900 font-medium mt-1">TRN: {facility.trn}</p>
                            )}
                        </div>
                        <div>
                            <p className="text-xs uppercase text-gray-500 mb-1">Issued to</p>
                            <p className="font-semibold text-gray-900">{booking.profiles?.display_name ?? "Player"}</p>
                            <p className="text-gray-500">Booking ID: {booking.id.slice(0, 8)}</p>
                            {booking.profiles?.trn && (
                                <p className="text-gray-900 font-medium mt-1">TRN: {booking.profiles.trn}</p>
                            )}
                        </div>
                    </section>

                    {/* Line items */}
                    <table className="w-full text-sm mb-6">
                        <thead>
                            <tr className="text-xs uppercase text-gray-500 border-b border-gray-200">
                                <th className="text-start font-medium py-2">Description</th>
                                <th className="text-end font-medium py-2 w-32">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-b border-gray-100">
                                <td className="py-3 align-top">
                                    <p className="font-medium text-gray-900">
                                        {booking.courts?.name} — {facility?.name}
                                    </p>
                                    <p className="text-xs text-gray-600 mt-0.5">
                                        {format(new Date(booking.date), "EEEE, MMMM d, yyyy")} · {booking.start_time.slice(0, 5)}–{booking.end_time.slice(0, 5)} · {booking.num_players} {booking.num_players === 1 ? "player" : "players"}
                                    </p>
                                </td>
                                <td className="py-3 text-end tabular-nums">
                                    {formatPrice(subtotal, booking.currency, locale)}
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Totals */}
                    <section className="ms-auto w-full max-w-xs text-sm space-y-1.5 border-t-2 border-gray-900 pt-3">
                        <div className="flex justify-between text-gray-700">
                            <span>Subtotal</span>
                            <span className="tabular-nums">{formatPrice(subtotal, booking.currency, locale)}</span>
                        </div>
                        {hasTrn ? (
                            <div className="flex justify-between text-gray-700">
                                <span>VAT (5%)</span>
                                <span className="tabular-nums">{formatPrice(vat, booking.currency, locale)}</span>
                            </div>
                        ) : (
                            <p className="text-xs text-gray-500 italic">VAT not applicable — facility under VAT registration threshold.</p>
                        )}
                        <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200">
                            <span>Total</span>
                            <span className="tabular-nums">{formatPrice(total, booking.currency, locale)}</span>
                        </div>
                    </section>

                    {/* Footer */}
                    <footer className="mt-10 pt-6 border-t border-gray-200 text-xs text-gray-500 space-y-1">
                        <p>
                            Payment processed via Stripe. Saha takes a 10% platform fee; remainder is settled to the facility&apos;s connected account.
                        </p>
                        <p>
                            For invoice queries, contact the facility{facility?.phone ? ` at ${facility.phone}` : ""}.
                        </p>
                    </footer>
                </article>
            </div>
        </div>
    );
}
