import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: facility } = await (supabase as any)
        .from("facilities")
        .select("id")
        .eq("owner_id", user.id)
        .single();

    if (!facility) return NextResponse.json({ error: "Facility not found" }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: courts } = await (supabase as any)
        .from("courts")
        .select("id, name")
        .eq("facility_id", facility.id);

    const courtIds: string[] = (courts ?? []).map((c: { id: string }) => c.id);
    const courtMap: Record<string, string> = Object.fromEntries(
        (courts ?? []).map((c: { id: string; name: string }) => [c.id, c.name])
    );

    if (courtIds.length === 0) {
        const csv = "date,time,court,player,amount_aed,status\n";
        return new NextResponse(csv, {
            headers: {
                "Content-Type": "text/csv",
                "Content-Disposition": `attachment; filename="bookings.csv"`,
            },
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bookings } = await (supabase as any)
        .from("bookings")
        .select("date, start_time, end_time, court_id, total_price, status, profiles(display_name)")
        .in("court_id", courtIds)
        .order("date", { ascending: false })
        .order("start_time");

    const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;

    const rows = [
        ["date", "start_time", "end_time", "court", "player", "amount_aed", "status"].join(","),
        ...(bookings ?? []).map((b: {
            date: string; start_time: string; end_time: string;
            court_id: string; total_price: number; status: string;
            profiles: { display_name: string } | null;
        }) => [
            escape(b.date),
            escape(b.start_time.slice(0, 5)),
            escape(b.end_time.slice(0, 5)),
            escape(courtMap[b.court_id] ?? ""),
            escape(b.profiles?.display_name ?? ""),
            escape(Number(b.total_price).toFixed(2)),
            escape(b.status),
        ].join(",")),
    ];

    const csv = rows.join("\n");
    const date = new Date().toISOString().slice(0, 10);

    return new NextResponse(csv, {
        headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="bookings-${date}.csv"`,
        },
    });
}
