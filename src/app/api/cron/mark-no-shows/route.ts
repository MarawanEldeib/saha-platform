import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit";

/**
 * SAH-86: Mark yesterday's confirmed bookings as no_show and increment the
 * player's reliability counter. Idempotent — re-running on the same day is a
 * no-op because the matching set narrows after the first run.
 *
 * Schedule via vercel.json — runs daily at 23:00 UTC (03:00 GST).
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Yesterday in UTC. Bookings whose date is yesterday and status is still
    // 'confirmed' did not get checked in — they are no-shows.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bookings } = await (supabase as any)
        .from("bookings")
        .select("id, player_id")
        .eq("status", "confirmed")
        .eq("date", yesterday);

    let marked = 0;
    const playerCounts = new Map<string, number>();

    for (const booking of (bookings ?? []) as Array<{ id: string; player_id: string }>) {
        const { error } = await supabase
            .from("bookings")
            .update({ status: "no_show" } as never)
            .eq("id", booking.id)
            .eq("status", "confirmed");

        if (error) {
            console.error("[mark-no-shows] failed to update", booking.id, error);
            continue;
        }

        playerCounts.set(booking.player_id, (playerCounts.get(booking.player_id) ?? 0) + 1);

        await logAuditEvent({
            actorId: null,
            actorRole: "system",
            action: "booking.no_show",
            targetType: "booking",
            targetId: booking.id,
            metadata: { player_id: booking.player_id, date: yesterday },
        });
        marked++;
    }

    // Increment per-player counter once per player, not once per booking.
    for (const [playerId, count] of playerCounts) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profile } = await (supabase as any)
            .from("profiles")
            .select("no_show_count")
            .eq("id", playerId)
            .single();
        const current = (profile?.no_show_count ?? 0) as number;

        await supabase
            .from("profiles")
            .update({ no_show_count: current + count } as never)
            .eq("id", playerId);
    }

    return NextResponse.json({ marked, players_affected: playerCounts.size });
}
