import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import Link from "next/link";
import { format } from "date-fns";
import {
    AlertTriangle,
    CheckCircle2,
    XCircle,
    MapPin,
    CreditCard,
    Trophy,
    Calendar,
    BookOpen,
    Clock,
} from "lucide-react";
import { getStripe } from "@/lib/stripe";

export const metadata = { title: "Diagnostics – Admin" };

interface FacilityRow {
    id: string;
    name: string;
    status: string;
    address: string;
    city: string;
    location: unknown;
    trn: string | null;
    stripe_account_id: string | null;
    profiles: { display_name: string | null } | null;
}

interface CourtRow {
    id: string;
    name: string;
    capacity: number;
    price_per_hour: number;
    is_active: boolean;
    sports: { name: string } | null;
}

interface HoursRow {
    day_of_week: number;
    open_time: string | null;
    close_time: string | null;
    is_closed: boolean;
}

interface BookingRow {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    status: string;
    total_price: number;
    created_at: string;
    courts: { name: string } | null;
    profiles: { display_name: string | null } | null;
}

interface AvailabilityRow {
    court_id: string;
    date: string;
    is_booked: boolean;
}

interface StripeStatus {
    detailsSubmitted: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    requirementsCurrentlyDue: string[];
    error?: string;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                ok
                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                    : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
            }`}
        >
            {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            {label}
        </span>
    );
}

function StatusCard({
    icon,
    title,
    children,
    tone = "default",
}: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
    tone?: "default" | "warning" | "danger";
}) {
    const toneClass =
        tone === "warning"
            ? "border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20"
            : tone === "danger"
                ? "border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"
                : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900";
    return (
        <section className={`rounded-2xl border p-5 ${toneClass}`}>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-3">
                {icon}
                {title}
            </h2>
            {children}
        </section>
    );
}

async function fetchStripeStatus(stripeAccountId: string | null): Promise<StripeStatus | null> {
    if (!stripeAccountId) return null;
    try {
        const stripe = getStripe();
        const account = await stripe.accounts.retrieve(stripeAccountId);
        return {
            detailsSubmitted: !!account.details_submitted,
            chargesEnabled: !!account.charges_enabled,
            payoutsEnabled: !!account.payouts_enabled,
            requirementsCurrentlyDue: account.requirements?.currently_due ?? [],
        };
    } catch (err) {
        return {
            detailsSubmitted: false,
            chargesEnabled: false,
            payoutsEnabled: false,
            requirementsCurrentlyDue: [],
            error: err instanceof Error ? err.message : "Stripe lookup failed",
        };
    }
}

export default async function FacilityDiagnosticsPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const locale = await getLocale();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if ((profile as { role: string } | null)?.role !== "admin") redirect(`/${locale}`);

    const admin = createAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: facilityData } = await (admin as any)
        .from("facilities")
        .select("id, name, status, address, city, location, trn, stripe_account_id, profiles!inner(display_name)")
        .eq("id", id)
        .single();
    if (!facilityData) notFound();
    const facility = facilityData as FacilityRow;

    // Parallel reads — courts, hours, last 20 bookings, next 7 days availability.
    // Server Component — Date.now() at request time is intentional.
    // eslint-disable-next-line react-hooks/purity
    const nowMs = Date.now();
    const today = new Date(nowMs).toISOString().slice(0, 10);
    const sevenDaysOut = new Date(nowMs + 7 * 24 * 3_600_000).toISOString().slice(0, 10);

    const [
        courtsResult,
        hoursResult,
        bookingsResult,
        availabilityResult,
        stripeStatus,
    ] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin as any)
            .from("courts")
            .select("id, name, capacity, price_per_hour, is_active, sports(name)")
            .eq("facility_id", id)
            .order("name"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin as any)
            .from("facility_hours")
            .select("day_of_week, open_time, close_time, is_closed")
            .eq("facility_id", id)
            .order("day_of_week"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin as any)
            .from("bookings")
            .select("id, date, start_time, end_time, status, total_price, created_at, courts!inner(name, facility_id), profiles(display_name)")
            .eq("courts.facility_id", id)
            .order("created_at", { ascending: false })
            .limit(20),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin as any)
            .from("court_availability")
            .select("court_id, date, is_booked, courts!inner(facility_id)")
            .eq("courts.facility_id", id)
            .gte("date", today)
            .lte("date", sevenDaysOut),
        fetchStripeStatus(facility.stripe_account_id),
    ]);

    const courts = (courtsResult.data ?? []) as CourtRow[];
    const hours = (hoursResult.data ?? []) as HoursRow[];
    const bookings = (bookingsResult.data ?? []) as BookingRow[];
    const availability = (availabilityResult.data ?? []) as AvailabilityRow[];

    // Build availability matrix: court x date → { defined, booked, free }
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(nowMs + i * 24 * 3_600_000);
        dates.push(d.toISOString().slice(0, 10));
    }
    const matrix: Record<string, Record<string, { defined: number; booked: number }>> = {};
    for (const c of courts) matrix[c.id] = {};
    for (const slot of availability) {
        const cell = matrix[slot.court_id];
        if (!cell) continue;
        if (!cell[slot.date]) cell[slot.date] = { defined: 0, booked: 0 };
        cell[slot.date].defined++;
        if (slot.is_booked) cell[slot.date].booked++;
    }

    // Per-court rollup so we can flag "this court has no slots defined" individually,
    // not just the all-courts-empty case.
    const courtHasSlots = new Map<string, boolean>();
    for (const c of courts) {
        const counts = matrix[c.id] ?? {};
        courtHasSlots.set(c.id, Object.keys(counts).length > 0);
    }

    // Stale pending = pending status and older than 24h. A handful of these is
    // normal (Stripe checkout abandonment); a pile suggests Stripe Connect or
    // webhook problems on this facility.
    // eslint-disable-next-line react-hooks/purity
    const staleThresholdMs = Date.now() - 24 * 3_600_000;
    const stalePendingCount = bookings.filter(
        (b) => b.status === "pending" && new Date(b.created_at).getTime() < staleThresholdMs,
    ).length;

    const facilityActive = facility.status === "active";
    const hasCoords = facility.location !== null;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center gap-4 flex-wrap">
                <Link
                    href={`/${locale}/admin/facilities/${facility.id}`}
                    className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white"
                >
                    ← Back to facility
                </Link>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Diagnostics</h1>
                <span className="text-sm text-gray-500 dark:text-gray-400">{facility.name}</span>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400">
                Read-only view of everything the booking flow checks for this facility. Use this to investigate
                player reports of &quot;I can&apos;t book&quot; or &quot;no slots showing.&quot;
            </p>

            {/* 1. Facility status */}
            <StatusCard
                icon={<MapPin className="h-4 w-4 text-gray-500" />}
                title="Facility status"
                tone={!facilityActive || !hasCoords ? "warning" : "default"}
            >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Status</p>
                        <StatusPill ok={facilityActive} label={facility.status} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Coordinates</p>
                        <StatusPill ok={hasCoords} label={hasCoords ? "Geocoded" : "Missing"} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">VAT TRN</p>
                        <StatusPill ok={!!facility.trn} label={facility.trn ? "Set" : "None"} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Owner</p>
                        <p className="text-gray-700 dark:text-gray-300 truncate">
                            {facility.profiles?.display_name ?? "—"}
                        </p>
                    </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                    {facility.address}, {facility.city}
                </p>
            </StatusCard>

            {/* 2. Stripe Connect */}
            <StatusCard
                icon={<CreditCard className="h-4 w-4 text-gray-500" />}
                title="Stripe Connect"
                tone={
                    !stripeStatus
                        ? "danger"
                        : !stripeStatus.chargesEnabled
                            ? "warning"
                            : "default"
                }
            >
                {!stripeStatus ? (
                    <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                        <XCircle className="h-4 w-4" />
                        Owner has not connected Stripe. Players cannot book this facility.
                    </div>
                ) : stripeStatus.error ? (
                    <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                        <AlertTriangle className="h-4 w-4" />
                        Stripe lookup failed: {stripeStatus.error}
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                            <StatusPill ok={stripeStatus.detailsSubmitted} label="Details submitted" />
                            <StatusPill ok={stripeStatus.chargesEnabled} label="Charges enabled" />
                            <StatusPill ok={stripeStatus.payoutsEnabled} label="Payouts enabled" />
                        </div>
                        {stripeStatus.requirementsCurrentlyDue.length > 0 && (
                            <div className="text-xs text-amber-700 dark:text-amber-400">
                                <p className="font-medium mb-1">Requirements currently due:</p>
                                <ul className="list-disc list-inside space-y-0.5">
                                    {stripeStatus.requirementsCurrentlyDue.map((r) => (
                                        <li key={r} className="font-mono">{r}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </StatusCard>

            {/* 3. Courts */}
            <StatusCard
                icon={<Trophy className="h-4 w-4 text-gray-500" />}
                title={`Courts (${courts.length})`}
                tone={courts.length === 0 || courts.every((c) => !c.is_active) ? "warning" : "default"}
            >
                {courts.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No courts defined. Players have nothing to book.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                                    <th className="text-left py-1.5 font-medium">Name</th>
                                    <th className="text-left py-1.5 font-medium">Sport</th>
                                    <th className="text-right py-1.5 font-medium">Capacity</th>
                                    <th className="text-right py-1.5 font-medium">Price/hr</th>
                                    <th className="text-right py-1.5 font-medium">Active</th>
                                </tr>
                            </thead>
                            <tbody>
                                {courts.map((c) => (
                                    <tr
                                        key={c.id}
                                        className={`border-b border-gray-100 dark:border-gray-800 last:border-0 ${
                                            !c.is_active ? "opacity-50" : ""
                                        }`}
                                    >
                                        <td className="py-1.5 text-gray-700 dark:text-gray-300">{c.name}</td>
                                        <td className="py-1.5 text-gray-600 dark:text-gray-400">{c.sports?.name ?? "—"}</td>
                                        <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{c.capacity}</td>
                                        <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">
                                            AED {c.price_per_hour}
                                        </td>
                                        <td className="py-1.5 text-right">
                                            <StatusPill ok={c.is_active} label={c.is_active ? "Yes" : "No"} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </StatusCard>

            {/* 4. Availability — next 7 days */}
            <StatusCard
                icon={<Calendar className="h-4 w-4 text-gray-500" />}
                title="Availability — next 7 days"
                tone={availability.length === 0 ? "warning" : "default"}
            >
                {courts.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No courts to show.</p>
                ) : availability.length === 0 ? (
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                        No availability slots defined for the next 7 days. Owner needs to publish slots before
                        anyone can book.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs font-mono">
                            <thead>
                                <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                                    <th className="text-left py-1.5 pe-3">Court</th>
                                    {dates.map((d) => (
                                        <th key={d} className="text-center py-1.5 px-2 font-medium">
                                            {format(new Date(d + "T00:00:00"), "EEE d")}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {courts.map((c) => {
                                    const hasSlots = courtHasSlots.get(c.id) ?? false;
                                    return (
                                    <tr key={c.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                                        <td className="py-1.5 pe-3 max-w-[200px]">
                                            <div className="text-gray-700 dark:text-gray-300 truncate">{c.name}</div>
                                            {!hasSlots && (
                                                <div className="text-[10px] text-amber-600 dark:text-amber-400 normal-case">
                                                    no slots defined
                                                </div>
                                            )}
                                        </td>
                                        {dates.map((d) => {
                                            const cell = matrix[c.id]?.[d];
                                            if (!cell) {
                                                return (
                                                    <td key={d} className="text-center py-1.5 px-2 text-gray-400">
                                                        —
                                                    </td>
                                                );
                                            }
                                            const free = cell.defined - cell.booked;
                                            const tone =
                                                free === 0
                                                    ? "text-red-600 dark:text-red-400"
                                                    : free <= 2
                                                        ? "text-amber-600 dark:text-amber-400"
                                                        : "text-emerald-600 dark:text-emerald-400";
                                            return (
                                                <td key={d} className={`text-center py-1.5 px-2 ${tone}`}>
                                                    {free}/{cell.defined}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Free / total slots per court per day. <span className="text-emerald-600 dark:text-emerald-400">Green</span> = healthy,{" "}
                            <span className="text-amber-600 dark:text-amber-400">amber</span> = nearly full,{" "}
                            <span className="text-red-600 dark:text-red-400">red</span> = fully booked, dash = no slots defined.
                        </p>
                    </div>
                )}
            </StatusCard>

            {/* 5. Recent bookings */}
            <StatusCard
                icon={<BookOpen className="h-4 w-4 text-gray-500" />}
                title={`Recent bookings (last ${bookings.length})`}
                tone={stalePendingCount >= 5 ? "warning" : "default"}
            >
                {stalePendingCount > 0 && (
                    <div className="mb-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>
                            <strong>{stalePendingCount}</strong> pending booking{stalePendingCount === 1 ? "" : "s"} older than 24h.
                            Likely abandoned Stripe checkouts. If this number grows, check Stripe Connect status above and recent webhook events.
                        </span>
                    </div>
                )}
                {bookings.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No bookings yet on this facility.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                                    <th className="text-left py-1.5 font-medium">When</th>
                                    <th className="text-left py-1.5 font-medium">Court</th>
                                    <th className="text-left py-1.5 font-medium">Player</th>
                                    <th className="text-left py-1.5 font-medium">Status</th>
                                    <th className="text-right py-1.5 font-medium">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bookings.map((b) => (
                                    <tr key={b.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                                        <td className="py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                            {format(new Date(b.date + "T00:00:00"), "MMM d")} · {b.start_time.slice(0, 5)}
                                        </td>
                                        <td className="py-1.5 text-gray-600 dark:text-gray-400">{b.courts?.name ?? "—"}</td>
                                        <td className="py-1.5 text-gray-600 dark:text-gray-400">
                                            {b.profiles?.display_name ?? "—"}
                                        </td>
                                        <td className="py-1.5">
                                            <span
                                                className={`text-xs font-medium px-2 py-0.5 rounded ${
                                                    b.status === "confirmed"
                                                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                                                        : b.status === "cancelled"
                                                            ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                                                            : b.status === "no_show"
                                                                ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                                                                : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                                                }`}
                                            >
                                                {b.status}
                                            </span>
                                        </td>
                                        <td className="py-1.5 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                            AED {b.total_price}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </StatusCard>

            {/* 6. Hours */}
            <StatusCard
                icon={<Clock className="h-4 w-4 text-gray-500" />}
                title="Opening hours"
                tone={hours.length === 0 ? "warning" : "default"}
            >
                {hours.length === 0 ? (
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                        No hours configured. Some availability checks may behave unexpectedly.
                    </p>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                        {Array.from({ length: 7 }).map((_, i) => {
                            const row = hours.find((h) => h.day_of_week === i);
                            return (
                                <div key={i} className="text-xs">
                                    <p className="font-medium text-gray-700 dark:text-gray-300">{DAY_NAMES[i]}</p>
                                    {!row ? (
                                        <p className="text-gray-400 dark:text-gray-600">not set</p>
                                    ) : row.is_closed ? (
                                        <p className="text-gray-500 dark:text-gray-400">closed</p>
                                    ) : (
                                        <p className="text-gray-600 dark:text-gray-400">
                                            {row.open_time?.slice(0, 5)} – {row.close_time?.slice(0, 5)}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </StatusCard>
        </div>
    );
}
