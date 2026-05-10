/**
 * SAH-126 Stage B: GET /api/bookings/report
 *
 * Generates a PDF booking report for the active facility owned by the
 * authenticated caller. Server-rendered with @react-pdf/renderer so we
 * don't depend on Puppeteer or a headless browser on Vercel.
 *
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (both optional; defaults to last
 * 30 days to today).
 *
 * Auth: cookie session (owner-scoped). The caller must own the active
 * facility — same scoping rule as `/api/bookings/export`.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveFacility } from "@/lib/facility-context";
import { renderToBuffer } from "@react-pdf/renderer";
import {
    BookingReportDocument,
    type BookingReportData,
    type BookingRow,
    type CourtBreakdown,
} from "@/lib/pdf/BookingReportDocument";
import { format } from "date-fns";

interface RawBooking {
    court_id: string;
    date: string;
    start_time: string;
    end_time: string;
    total_price: number;
    status: string;
    profiles: { display_name: string | null } | null;
}

export async function GET(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const facility = await getActiveFacility(supabase, user.id);
    if (!facility) {
        return NextResponse.json({ error: "No active facility" }, { status: 404 });
    }

    // Default range: last 30 days → today (inclusive).
    const today = new Date();
    const defaultFrom = new Date(today);
    defaultFrom.setDate(today.getDate() - 30);

    const from = req.nextUrl.searchParams.get("from") ?? defaultFrom.toISOString().slice(0, 10);
    const to = req.nextUrl.searchParams.get("to") ?? today.toISOString().slice(0, 10);

    // Court ids for this facility.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: courts } = await (supabase as any)
        .from("courts")
        .select("id, name")
        .eq("facility_id", facility.id);
    const courtList = (courts ?? []) as { id: string; name: string }[];
    const courtMap = new Map(courtList.map((c) => [c.id, c.name]));

    if (courtList.length === 0) {
        return NextResponse.json({ error: "No courts on this facility" }, { status: 400 });
    }

    const courtIds = courtList.map((c) => c.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bookings } = await (supabase as any)
        .from("bookings")
        .select("court_id, date, start_time, end_time, total_price, status, profiles(display_name)")
        .in("court_id", courtIds)
        .gte("date", from)
        .lte("date", to)
        .order("date")
        .order("start_time");

    const list = ((bookings ?? []) as RawBooking[]);

    // Summary stats.
    const totalBookings = list.length;
    const revenueStatuses = ["confirmed", "completed"];
    const totalRevenue = list
        .filter((b) => revenueStatuses.includes(b.status))
        .reduce((s, b) => s + Number(b.total_price), 0);
    const counts = {
        confirmed: list.filter((b) => b.status === "confirmed").length,
        completed: list.filter((b) => b.status === "completed").length,
        pending: list.filter((b) => b.status === "pending").length,
        cancelled: list.filter((b) => b.status === "cancelled").length,
        noShow: list.filter((b) => b.status === "no_show").length,
    };
    const averageBookingValue = totalBookings > 0 ? totalRevenue / Math.max(1, counts.confirmed + counts.completed) : 0;
    const noShowRate = totalBookings > 0 ? counts.noShow / totalBookings : 0;

    // Per-court breakdown.
    const perCourtMap = new Map<string, CourtBreakdown>();
    for (const c of courtList) {
        perCourtMap.set(c.id, { court_id: c.id, court_name: c.name, bookings: 0, revenue: 0 });
    }
    for (const b of list) {
        const slot = perCourtMap.get(b.court_id);
        if (!slot) continue;
        slot.bookings += 1;
        if (revenueStatuses.includes(b.status)) slot.revenue += Number(b.total_price);
    }
    const perCourt = Array.from(perCourtMap.values()).sort((a, b) => b.revenue - a.revenue);

    const rows: BookingRow[] = list.map((b) => ({
        date: b.date,
        start_time: b.start_time.slice(0, 5),
        end_time: b.end_time.slice(0, 5),
        court_name: courtMap.get(b.court_id) ?? "—",
        player_name: b.profiles?.display_name ?? "—",
        status: b.status,
        amount: Number(b.total_price),
    }));

    const data: BookingReportData = {
        facilityName: facility.name,
        facilityCity: (facility as { city?: string }).city ?? "",
        facilityCountry: (facility as { country?: string }).country ?? "AE",
        currency: facility.currency ?? "AED",
        periodFrom: from,
        periodTo: to,
        generatedAt: format(new Date(), "PPpp"),
        summary: {
            totalBookings,
            totalRevenue,
            confirmed: counts.confirmed,
            completed: counts.completed,
            pending: counts.pending,
            cancelled: counts.cancelled,
            noShow: counts.noShow,
            averageBookingValue,
            noShowRate,
        },
        perCourt,
        rows,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(BookingReportDocument(data) as any);

    const filename = `saha-bookings-${facility.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${from}-to-${to}.pdf`;
    return new NextResponse(buffer as never, {
        status: 200,
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "private, no-store",
        },
    });
}
