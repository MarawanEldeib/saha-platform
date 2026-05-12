/**
 * SAH-118: shared booking flow used by both the dashboard server action
 * (`createBookingAndCheckoutAction`) and the public REST API
 * (`POST /api/v1/bookings`).
 *
 * Single source of truth for: slot validation, court + facility loading,
 * Stripe-readiness check, price computation, slot locking (CAS), booking +
 * payment row inserts, optional wallet-credit redemption, and Stripe
 * Checkout session creation.
 *
 * The caller (action OR API) is responsible for:
 *   - resolving the authenticated user (cookie or Bearer)
 *   - applying its own rate limit policy
 *   - knowing the request's `appUrl` and `locale` for Checkout return URLs
 *
 * Returning a discriminated union keeps the contract typed across both
 * call sites and avoids the older `{ error?, success?, ... }` shape.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { Database } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { capWalletCredit, computeCheckoutAmounts } from "@/lib/booking-pricing";
import { getStripe } from "@/lib/stripe";
import { getPlatformFeePercent } from "@/lib/platform-settings";
import { captureRouteError } from "@/lib/sentry-helpers";

export interface BookCourtParams {
    /** Authed Supabase client (RLS will enforce access). */
    supabase: SupabaseClient<Database>;
    /** Already-resolved user id. The caller has authenticated. */
    userId: string;
    availabilityId: string;
    numPlayers: number;
    /** Optional wallet credit to apply, capped server-side at the
     *  platform-fee portion so the owner never goes negative. */
    creditToApply?: number;
    /** Origin used in Checkout success/cancel URLs (e.g. `https://sahasports.vercel.app`). */
    appUrl: string;
    /** Locale prefix used in Checkout success/cancel URLs. */
    locale: string;
}

export type BookCourtResult =
    | {
        ok: true;
        bookingId: string;
        checkoutUrl: string;
        /** Unix seconds; matches the Stripe session's `expires_at`. */
        expiresAt: number;
        appliedCredit: number;
    }
    | { ok: false; error: string };

export async function bookCourtCore(params: BookCourtParams): Promise<BookCourtResult> {
    const { supabase, userId, availabilityId, numPlayers, creditToApply, appUrl, locale } = params;

    // SAH-127: strict role separation. Only role='user' may book courts;
    // owners and admins must use a separate player account. RLS also
    // enforces this at the INSERT, but bailing here gives a clearer error
    // than the cryptic RLS denial, and saves a Stripe round-trip.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profileRow } = await (supabase as any)
        .from("profiles").select("role").eq("id", userId).single();
    const role = (profileRow as { role?: string } | null)?.role ?? "user";
    if (role !== "user") {
        return {
            ok: false,
            error: "Only player accounts can book courts. Sign in with a player account to continue.",
        };
    }

    // Authoritative slot data — never trust client times.
    const { data: slot } = await supabase
        .from("court_availability")
        .select("id, court_id, date, start_time, end_time, is_booked")
        .eq("id", availabilityId)
        .single();
    if (!slot) return { ok: false, error: "Slot not found" };
    if (slot.is_booked) return { ok: false, error: "Slot is no longer available" };

    const { data: court } = await supabase
        .from("courts")
        .select("id, name, price_per_hour, capacity, facility_id, facilities(id, name, stripe_account_id, currency)")
        .eq("id", slot.court_id)
        .single();
    if (!court) return { ok: false, error: "Court not found" };

    if (numPlayers < 1 || numPlayers > (court.capacity ?? 1)) {
        return { ok: false, error: "Invalid number of players" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const facilityData = (court as any).facilities;
    const stripeAccountId = facilityData?.stripe_account_id as string | null;
    const currency = (facilityData?.currency as string) ?? "AED";

    if (!stripeAccountId) {
        return { ok: false, error: "This facility is not yet ready to receive payments." };
    }

    // Verify the connected Stripe account is fully onboarded.
    try {
        const account = await getStripe().accounts.retrieve(stripeAccountId);
        if (!account.charges_enabled || !account.details_submitted) {
            return { ok: false, error: "This facility is not yet ready to receive payments." };
        }
    } catch {
        return { ok: false, error: "Could not verify the facility's payment account. Please try again." };
    }

    // Compute price from authoritative slot times.
    const [sh, sm] = slot.start_time.split(":").map(Number);
    const [eh, em] = slot.end_time.split(":").map(Number);
    const durationHours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    if (durationHours <= 0) return { ok: false, error: "Invalid slot" };
    const totalPrice = Math.round(court.price_per_hour * durationHours * 100) / 100;

    // CAS lock the slot. If a concurrent caller locked it first, zero rows
    // are returned and we abort cleanly.
    const { data: lockedRows, error: lockError } = await supabase
        .from("court_availability")
        .update({ is_booked: true } as never)
        .eq("id", availabilityId)
        .eq("is_booked", false)
        .select("id");

    if (lockError || !lockedRows || lockedRows.length === 0) {
        return { ok: false, error: "Slot is no longer available" };
    }

    // Booking row (pending), using slot-canonical times.
    const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
            availability_id: availabilityId,
            court_id: slot.court_id,
            player_id: userId,
            date: slot.date,
            start_time: slot.start_time,
            end_time: slot.end_time,
            num_players: numPlayers,
            total_price: totalPrice,
            currency,
            status: "pending",
        } as never)
        .select("id")
        .single();

    if (bookingError || !booking) {
        await supabase.from("court_availability").update({ is_booked: false } as never).eq("id", availabilityId);
        return { ok: false, error: "Failed to create booking" };
    }

    // Pending payment row.
    await supabase.from("payments").insert({
        booking_id: booking.id,
        amount: totalPrice,
        currency,
        status: "pending",
    } as never);

    // SAH-93: optionally redeem wallet credit. Capped so the platform fee
    // can never go negative — owner stays whole; platform absorbs the cost.
    let appliedCredit = 0;
    const feePercent = await getPlatformFeePercent();

    if (creditToApply && creditToApply > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: walletRow } = await (supabase as any)
            .from("wallet_balances")
            .select("credit_aed")
            .eq("user_id", userId)
            .maybeSingle();
        const walletBalance = Number(walletRow?.credit_aed ?? 0);
        const requested = capWalletCredit(creditToApply, walletBalance, totalPrice, feePercent);
        if (requested > 0) {
            try {
                const admin = createAdminClient();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data: spent } = await (admin as any).rpc("spend_wallet_credit", {
                    p_user_id: userId,
                    p_amount: requested,
                    p_booking_id: booking.id,
                });
                appliedCredit = typeof spent === "number" ? spent : Number(spent ?? 0);
            } catch (err) {
                captureRouteError(err, {
                    route: "booking-flow",
                    user_id: userId,
                    extra: { booking_id: booking.id, requested, phase: "spend_wallet_credit" },
                });
            }
        }
    }

    const { chargeCents: chargeAmount, feeCents: feeAmount } =
        computeCheckoutAmounts(totalPrice, appliedCredit, feePercent);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: "payment",
        line_items: [{
            quantity: 1,
            price_data: {
                currency: currency.toLowerCase(),
                unit_amount: chargeAmount,
                product_data: {
                    name: facilityData?.name ? `${facilityData.name} — ${court.name}` : court.name,
                    description: appliedCredit > 0
                        ? `${slot.date} · ${slot.start_time}–${slot.end_time} (${appliedCredit.toFixed(2)} ${currency} wallet credit applied)`
                        : `${slot.date} · ${slot.start_time}–${slot.end_time}`,
                },
            },
        }],
        metadata: {
            booking_id: booking.id,
            availability_id: availabilityId,
            wallet_credit_applied: String(appliedCredit),
        },
        success_url: `${appUrl}/${locale}/bookings/${booking.id}?success=1`,
        cancel_url: `${appUrl}/${locale}/bookings/${booking.id}?cancelled=1`,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 min to pay
        payment_intent_data: {
            application_fee_amount: feeAmount,
            transfer_data: { destination: stripeAccountId },
        },
    };

    let session: Stripe.Checkout.Session;
    try {
        session = await getStripe().checkout.sessions.create(sessionParams);
    } catch (sessionErr) {
        captureRouteError(sessionErr, {
            route: "booking-flow",
            user_id: userId,
            extra: { booking_id: booking.id, applied_credit: appliedCredit, phase: "stripe_session_create" },
        });
        // Stripe rejected — release the slot, mark the booking cancelled,
        // and refund any wallet credit we already spent.
        await supabase.from("bookings").update({ status: "cancelled" } as never).eq("id", booking.id);
        await supabase.from("court_availability").update({ is_booked: false } as never).eq("id", availabilityId);
        if (appliedCredit > 0) {
            try {
                const admin = createAdminClient();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (admin as any).rpc("refund_wallet_credit", {
                    p_user_id: userId,
                    p_amount: appliedCredit,
                    p_booking_id: booking.id,
                });
            } catch (refundErr) {
                captureRouteError(refundErr, {
                    route: "booking-flow",
                    user_id: userId,
                    level: "error",
                    extra: { booking_id: booking.id, applied_credit: appliedCredit, phase: "credit_refund_after_stripe_failure" },
                });
            }
        }
        return { ok: false, error: "Could not start payment. Please try again." };
    }

    if (!session.url) {
        return { ok: false, error: "Stripe did not return a checkout URL." };
    }

    return {
        ok: true,
        bookingId: booking.id,
        checkoutUrl: session.url,
        expiresAt: session.expires_at,
        appliedCredit,
    };
}
