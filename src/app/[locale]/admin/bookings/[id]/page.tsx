import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect, notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, Calendar, MapPin, User, Mail, Phone, Hash, ScrollText, CreditCard, Users as UsersIcon } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { Metadata } from "next";

// SAH-137: admin booking detail. The player booking page filters by
// `.eq("player_id", user.id)`, so admins hit a 404 when they click "View"
// on a row in /admin/bookings. This page uses the admin client (RLS-bypass)
// to surface the full picture — booking row, payments, guests, audit log —
// for moderation. View-only; cancel/refund are explicit follow-ups.

export const metadata: Metadata = { title: "Admin · Booking — Saha" };

const STATUS_STYLES: Record<string, string> = {
    confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    no_show: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const PAYMENT_STATUS_STYLES: Record<string, string> = {
    succeeded: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    refunded: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

interface BookingRow {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    status: string;
    total_price: string | number;
    currency: string;
    num_players: number;
    notes: string | null;
    qr_code_token: string;
    recurring_group_id: string | null;
    move_count: number | null;
    created_at: string;
    updated_at: string;
    player_id: string;
    court_id: string;
    availability_id: string;
    courts: {
        name: string;
        facilities: { id: string; name: string; address: string; city: string } | null;
    } | null;
    profiles: { display_name: string | null; phone: string | null } | null;
}

interface PaymentRow {
    id: string;
    stripe_payment_intent_id: string | null;
    stripe_checkout_session_id: string | null;
    amount: string | number;
    currency: string;
    status: string;
    created_at: string;
}

interface GuestRow {
    id: string;
    name: string | null;
    email: string | null;
    invited_at: string;
    confirmed_at: string | null;
}

interface AuditRow {
    id: string;
    actor_id: string | null;
    actor_role: string;
    action: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

export default async function AdminBookingDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const supabase = await createClient();
    const locale = await getLocale();

    // Defense in depth — layout already enforces admin, but never trust it.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);
    const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single();
    if ((profile as { role: string } | null)?.role !== "admin") {
        redirect(`/${locale}`);
    }

    const admin = createAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bookingData } = await (admin as any)
        .from("bookings")
        .select(`
            id, date, start_time, end_time, status, total_price, currency, num_players,
            notes, qr_code_token, recurring_group_id, move_count, created_at, updated_at,
            player_id, court_id, availability_id,
            courts(name, facilities(id, name, address, city)),
            profiles(display_name, phone)
        `)
        .eq("id", id)
        .maybeSingle();

    if (!bookingData) notFound();
    const booking = bookingData as BookingRow;

    // Email lives on auth.users, not profiles. Fetch via the auth admin API.
    let playerEmail: string | null = null;
    try {
        const { data: { user: playerUser } } = await admin.auth.admin.getUserById(booking.player_id);
        playerEmail = playerUser?.email ?? null;
    } catch {
        /* swallow — non-fatal, page still renders */
    }

    const [{ data: paymentsData }, { data: guestsData }, { data: auditData }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin as any)
            .from("payments")
            .select("id, stripe_payment_intent_id, stripe_checkout_session_id, amount, currency, status, created_at")
            .eq("booking_id", id)
            .order("created_at", { ascending: false }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin as any)
            .from("booking_guests")
            .select("id, name, email, invited_at, confirmed_at")
            .eq("booking_id", id)
            .order("invited_at", { ascending: true }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin as any)
            .from("audit_log")
            .select("id, actor_id, actor_role, action, metadata, created_at")
            .eq("target_type", "booking")
            .eq("target_id", id)
            .order("created_at", { ascending: false })
            .limit(50),
    ]);

    const payments = (paymentsData ?? []) as PaymentRow[];
    const guests = (guestsData ?? []) as GuestRow[];
    const auditEntries = (auditData ?? []) as AuditRow[];

    const facility = booking.courts?.facilities;
    const court = booking.courts;

    return (
        <div className="space-y-6 max-w-4xl">
            <Link
                href={`/${locale}/admin/bookings`}
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
                <ArrowLeft className="h-4 w-4" /> Back to bookings
            </Link>

            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Booking {booking.id.slice(0, 8)}…
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Created {format(new Date(booking.created_at), "PPP p")}
                    </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[booking.status] ?? ""}`}>
                    {booking.status}
                </span>
            </div>

            {/* Core info */}
            <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-emerald-500" /> Booking
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <div>
                        <div className="text-xs uppercase text-gray-500 dark:text-gray-400">Date</div>
                        <div className="text-gray-900 dark:text-white">{format(new Date(booking.date), "PPP")}</div>
                    </div>
                    <div>
                        <div className="text-xs uppercase text-gray-500 dark:text-gray-400">Time</div>
                        <div className="text-gray-900 dark:text-white">
                            {booking.start_time.slice(0, 5)} – {booking.end_time.slice(0, 5)}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs uppercase text-gray-500 dark:text-gray-400">Players</div>
                        <div className="text-gray-900 dark:text-white">{booking.num_players}</div>
                    </div>
                    <div>
                        <div className="text-xs uppercase text-gray-500 dark:text-gray-400">Total</div>
                        <div className="text-gray-900 dark:text-white font-semibold">
                            {formatPrice(Number(booking.total_price), booking.currency, locale)}
                        </div>
                    </div>
                    {booking.recurring_group_id && (
                        <div className="sm:col-span-2">
                            <div className="text-xs uppercase text-gray-500 dark:text-gray-400">Recurring series</div>
                            <div className="font-mono text-xs text-gray-700 dark:text-gray-300">{booking.recurring_group_id}</div>
                        </div>
                    )}
                    {(booking.move_count ?? 0) > 0 && (
                        <div>
                            <div className="text-xs uppercase text-gray-500 dark:text-gray-400">Times moved</div>
                            <div className="text-gray-900 dark:text-white">{booking.move_count}</div>
                        </div>
                    )}
                    {booking.notes && (
                        <div className="sm:col-span-2">
                            <div className="text-xs uppercase text-gray-500 dark:text-gray-400">Notes</div>
                            <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{booking.notes}</div>
                        </div>
                    )}
                </div>
            </section>

            {/* Facility + court */}
            <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-emerald-500" /> Facility &amp; court
                </h2>
                {facility ? (
                    <div className="text-sm">
                        <div className="font-medium text-gray-900 dark:text-white">{facility.name}</div>
                        <div className="text-gray-500 dark:text-gray-400">{facility.address}, {facility.city}</div>
                        <div className="text-gray-700 dark:text-gray-300 mt-2">Court: {court?.name ?? "—"}</div>
                        <Link
                            href={`/${locale}/admin/facilities/${facility.id}/diagnostics`}
                            className="inline-block mt-3 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                        >
                            Open facility diagnostics →
                        </Link>
                    </div>
                ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">Facility data missing.</p>
                )}
            </section>

            {/* Player */}
            <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <User className="h-4 w-4 text-emerald-500" /> Player
                </h2>
                <div className="text-sm space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span className="text-gray-500 dark:text-gray-400 inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5" />Name</span>
                        <span className="text-gray-900 dark:text-white">{booking.profiles?.display_name ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-gray-500 dark:text-gray-400 inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />Email</span>
                        <span className="text-gray-900 dark:text-white">{playerEmail ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-gray-500 dark:text-gray-400 inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />Phone</span>
                        <span className="text-gray-900 dark:text-white">{booking.profiles?.phone ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-gray-500 dark:text-gray-400 inline-flex items-center gap-1.5"><Hash className="h-3.5 w-3.5" />User ID</span>
                        <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{booking.player_id}</span>
                    </div>
                </div>
            </section>

            {/* Payments */}
            <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-emerald-500" /> Payments
                </h2>
                {payments.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">No payment rows recorded.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="text-gray-500 dark:text-gray-400">
                                <tr>
                                    <th className="text-start font-medium pb-2">When</th>
                                    <th className="text-start font-medium pb-2">Amount</th>
                                    <th className="text-start font-medium pb-2">Status</th>
                                    <th className="text-start font-medium pb-2">PaymentIntent</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {payments.map((p) => (
                                    <tr key={p.id}>
                                        <td className="py-2 text-gray-700 dark:text-gray-300 tabular-nums whitespace-nowrap">
                                            {format(new Date(p.created_at), "PP p")}
                                        </td>
                                        <td className="py-2 tabular-nums text-gray-900 dark:text-white">
                                            {formatPrice(Number(p.amount), p.currency, locale)}
                                        </td>
                                        <td className="py-2">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${PAYMENT_STATUS_STYLES[p.status] ?? ""}`}>
                                                {p.status}
                                            </span>
                                        </td>
                                        <td className="py-2 font-mono text-[10px] text-gray-500 dark:text-gray-400">
                                            {p.stripe_payment_intent_id ?? "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Guests */}
            {guests.length > 0 && (
                <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <UsersIcon className="h-4 w-4 text-emerald-500" /> Guests ({guests.length})
                    </h2>
                    <ul className="text-sm space-y-2">
                        {guests.map((g) => (
                            <li key={g.id} className="flex items-center justify-between gap-3 py-1 border-b border-gray-100 dark:border-gray-800 last:border-0">
                                <div>
                                    <div className="text-gray-900 dark:text-white">{g.name ?? g.email ?? "(unnamed)"}</div>
                                    {g.email && g.name && <div className="text-xs text-gray-500 dark:text-gray-400">{g.email}</div>}
                                </div>
                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${g.confirmed_at ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>
                                    {g.confirmed_at ? "confirmed" : "invited"}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Audit log */}
            <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <ScrollText className="h-4 w-4 text-emerald-500" /> Audit log ({auditEntries.length})
                </h2>
                {auditEntries.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">No audit entries for this booking yet.</p>
                ) : (
                    <ul className="text-xs space-y-2.5">
                        {auditEntries.map((e) => (
                            <li key={e.id} className="border-b border-gray-100 dark:border-gray-800 pb-2.5 last:border-0">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="font-mono text-gray-900 dark:text-white">{e.action}</span>
                                    <span className="text-gray-500 dark:text-gray-400 tabular-nums">{format(new Date(e.created_at), "PP p")}</span>
                                </div>
                                <div className="text-gray-500 dark:text-gray-400 mt-1">
                                    by <span className="font-medium">{e.actor_role}</span>
                                    {e.actor_id && <> · <span className="font-mono">{e.actor_id.slice(0, 8)}…</span></>}
                                </div>
                                {e.metadata && Object.keys(e.metadata).length > 0 && (
                                    <pre className="mt-1.5 text-[10px] bg-gray-50 dark:bg-gray-800 rounded p-2 overflow-x-auto text-gray-700 dark:text-gray-300">
                                        {JSON.stringify(e.metadata, null, 2)}
                                    </pre>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
