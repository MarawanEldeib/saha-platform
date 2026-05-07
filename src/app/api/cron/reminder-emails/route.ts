import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { format } from "date-fns";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();
    const now = new Date();

    // Build target windows: 24h and 2h before booking start
    const windows = [
        { label: "24h", minutesAhead: 24 * 60, reminderField: "reminder_24h_sent" as const },
        { label: "2h", minutesAhead: 2 * 60, reminderField: "reminder_2h_sent" as const },
    ];

    let totalSent = 0;

    for (const window of windows) {
        const targetTime = new Date(now.getTime() + window.minutesAhead * 60 * 1000);
        const targetDate = targetTime.toISOString().split("T")[0];
        const targetHour = targetTime.getHours().toString().padStart(2, "0");
        const targetMinute = targetTime.getMinutes().toString().padStart(2, "0");

        const { data: bookings } = await supabase
            .from("bookings")
            .select(`
                id, date, start_time, end_time, num_players, total_price, currency, qr_code_token,
                courts(name, facilities(name, address, city)),
                profiles(display_name, email:id)
            `)
            .eq("status", "confirmed")
            .eq("date", targetDate)
            .like("start_time", `${targetHour}:${targetMinute}%`)
            .eq(window.reminderField, false);

        for (const booking of bookings ?? []) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const court = (booking as any).courts;
            const facility = court?.facilities;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const profile = (booking as any).profiles;

            if (!profile?.email) continue;

            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
            const bookingUrl = `${appUrl}/en/bookings/${booking.id}`;
            const formattedDate = format(new Date(booking.date), "EEEE, MMMM d, yyyy");

            const subject = window.label === "24h"
                ? `Reminder: ${court?.name} tomorrow at ${booking.start_time.slice(0, 5)}`
                : `Your booking starts in 2 hours – ${court?.name}`;

            await resend.emails.send({
                from: "Saha <noreply@saha.ae>",
                to: profile.email,
                subject,
                html: `
                    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
                        <h2 style="font-size:20px;font-weight:700;margin-bottom:4px">
                            ${window.label === "24h" ? "See you tomorrow!" : "Your booking starts soon!"}
                        </h2>
                        <p style="color:#6b7280;margin-bottom:24px">
                            Hi ${profile.display_name ?? "there"}, here&apos;s your booking reminder.
                        </p>
                        <div style="background:#f9fafb;border-radius:12px;padding:20px;margin-bottom:24px">
                            <p style="margin:0 0 8px"><strong>Court:</strong> ${court?.name}</p>
                            <p style="margin:0 0 8px"><strong>Facility:</strong> ${facility?.name}</p>
                            <p style="margin:0 0 8px"><strong>Date:</strong> ${formattedDate}</p>
                            <p style="margin:0 0 8px"><strong>Time:</strong> ${booking.start_time.slice(0, 5)} – ${booking.end_time.slice(0, 5)}</p>
                            <p style="margin:0 0 8px"><strong>Players:</strong> ${booking.num_players}</p>
                            <p style="margin:0"><strong>Address:</strong> ${facility?.address}, ${facility?.city}</p>
                        </div>
                        <a href="${bookingUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
                            View Booking & QR Code
                        </a>
                    </div>
                `,
            });

            // Mark as sent
            await supabase
                .from("bookings")
                .update({ [window.reminderField]: true } as never)
                .eq("id", booking.id);

            totalSent++;
        }
    }

    return NextResponse.json({ sent: totalSent });
}
