import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsApp } from "@/lib/twilio";
import { sendBookingConfirmationEmail } from "@/lib/emails/booking-confirmation-email";
import { format } from "date-fns";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

    let event: Stripe.Event;
    try {
        event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch {
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Idempotency: insert the event id first. If it already exists, this is
    // a retry — return 200 without re-running side effects (WhatsApp + email).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dedupError } = await (supabase as any)
        .from("stripe_events")
        .insert({ id: event.id, type: event.type });
    if (dedupError) {
        // 23505 = unique_violation — already processed, ack and skip.
        if (dedupError.code === "23505") {
            return NextResponse.json({ received: true, duplicate: true });
        }
        // Anything else: let Stripe retry.
        return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const bookingId = session.metadata?.booking_id;
        if (!bookingId) return NextResponse.json({ received: true });

        await supabase
            .from("bookings")
            .update({ status: "confirmed" } as never)
            .eq("id", bookingId);

        await supabase
            .from("court_availability")
            .update({ is_booked: true } as never)
            .eq("id", session.metadata?.availability_id ?? "");

        await supabase
            .from("payments")
            .update({ status: "succeeded", stripe_checkout_session_id: session.id } as never)
            .eq("booking_id", bookingId);

        // Send WhatsApp confirmation and email
        const { data: booking } = await supabase
            .from("bookings")
            .select(`
                id, date, start_time, end_time, num_players, total_price, currency, qr_code_token,
                courts(name, facilities(name, address, city)),
                profiles(id, display_name, phone)
            `)
            .eq("id", bookingId)
            .single();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const court = (booking as any)?.courts;
        const facility = court?.facilities;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const profile = (booking as any)?.profiles;

        if (booking && profile?.phone) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
            const bookingUrl = `${appUrl}/en/bookings/${booking.id}`;
            const readableDate = format(new Date(booking.date), "EEEE, MMMM d, yyyy");

            await sendWhatsApp(
                profile.phone,
                `✅ Booking confirmed!\n\n` +
                `🏟 ${court?.name} at ${facility?.name}\n` +
                `📅 ${readableDate}\n` +
                `⏰ ${booking.start_time.slice(0, 5)} – ${booking.end_time.slice(0, 5)}\n` +
                `📍 ${facility?.address}, ${facility?.city}\n\n` +
                `View your booking & QR code:\n${bookingUrl}`
            ).catch(() => {/* WhatsApp not blocking — fire and forget */});
        }

        // Send confirmation email (fire and forget)
        if (booking && profile) {
            try {
                // Fetch player email from auth
                const { data: { user } } = await supabase.auth.admin.getUserById(profile.id);
                const playerEmail = user?.email;

                if (playerEmail) {
                    await sendBookingConfirmationEmail({
                        bookingId: booking.id,
                        playerName: profile.display_name || "Player",
                        playerEmail,
                        facilityName: facility?.name || "Facility",
                        facilityAddress: facility?.address || "",
                        facilityCity: facility?.city || "",
                        courtName: court?.name || "Court",
                        date: booking.date,
                        startTime: booking.start_time.slice(0, 5),
                        endTime: booking.end_time.slice(0, 5),
                        numPlayers: booking.num_players || 1,
                        totalPrice: booking.total_price || 0,
                        currency: booking.currency || "USD",
                        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
                    }).catch((error) => {
                        console.error("Error sending booking confirmation email:", error);
                        /* Email not blocking — fire and forget */
                    });
                }
            } catch (error) {
                console.error("Error in booking confirmation email flow:", error);
                /* Continue webhook processing */
            }
        }
    }

    if (event.type === "checkout.session.expired") {
        const session = event.data.object as Stripe.Checkout.Session;
        const bookingId = session.metadata?.booking_id;
        const availabilityId = session.metadata?.availability_id;
        if (!bookingId) return NextResponse.json({ received: true });

        await supabase
            .from("court_availability")
            .update({ is_booked: false } as never)
            .eq("id", availabilityId ?? "");

        await supabase
            .from("bookings")
            .update({ status: "cancelled" } as never)
            .eq("id", bookingId);
    }

    return NextResponse.json({ received: true });
}
