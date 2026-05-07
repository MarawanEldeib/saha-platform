import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch {
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const supabase = await createClient();

    if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const bookingId = session.metadata?.booking_id;
        if (!bookingId) return NextResponse.json({ received: true });

        // Mark booking as confirmed
        await supabase
            .from("bookings")
            .update({ status: "confirmed" } as never)
            .eq("id", bookingId);

        // Mark availability slot as booked
        await supabase
            .from("court_availability")
            .update({ is_booked: true } as never)
            .eq("id", session.metadata?.availability_id ?? "");

        // Update payment record
        await supabase
            .from("payments")
            .update({ status: "succeeded", stripe_checkout_session_id: session.id } as never)
            .eq("booking_id", bookingId);
    }

    if (event.type === "checkout.session.expired") {
        const session = event.data.object as Stripe.Checkout.Session;
        const bookingId = session.metadata?.booking_id;
        const availabilityId = session.metadata?.availability_id;
        if (!bookingId) return NextResponse.json({ received: true });

        // Release the slot
        await supabase
            .from("court_availability")
            .update({ is_booked: false } as never)
            .eq("id", availabilityId ?? "");

        // Cancel the booking
        await supabase
            .from("bookings")
            .update({ status: "cancelled" } as never)
            .eq("id", bookingId);
    }

    return NextResponse.json({ received: true });
}
