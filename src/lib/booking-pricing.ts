/**
 * Pure pricing helpers for the booking flow. Extracted from actions.ts so the
 * critical money math is testable without mocking Supabase / Stripe.
 *
 * The contract keeps the owner whole on every redemption: their transfer is
 * always `total * (1 - platformFee)` regardless of how much wallet credit
 * the player applied. The platform absorbs the credit by reducing
 * application_fee_amount; the cap below ensures it can never go negative
 * (Stripe rejects negative fees).
 */

export interface BookingPriceInput {
    /** Court price per hour in the facility's currency. */
    pricePerHour: number;
    /** Slot start (HH:MM[:ss]). */
    startTime: string;
    /** Slot end (HH:MM[:ss]). */
    endTime: string;
}

export interface CheckoutAmounts {
    /** Gross booking price in major currency units (e.g. AED). */
    totalPrice: number;
    /** Customer-charged amount in cents (Stripe wants integer cents). */
    chargeCents: number;
    /** Owner net in cents — always `totalPrice * (1 - platformFee)`. */
    ownerNetCents: number;
    /** Platform application_fee_amount in cents — never negative. */
    feeCents: number;
    /** Wallet credit actually applied (≤ requested, capped). */
    appliedCredit: number;
}

const ROUND_2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Whether a player-initiated cancellation falls inside the >24h refund
 * window. Owner-initiated cancellations bypass this gate.
 */
export function isWithinCancellationRefundWindow(
    bookingDate: string,
    startTime: string,
    now: Date = new Date(),
): { hoursUntil: number; withinWindow: boolean } {
    const start = new Date(`${bookingDate}T${startTime}`);
    const hoursUntil = (start.getTime() - now.getTime()) / 3_600_000;
    return { hoursUntil, withinWindow: hoursUntil > 24 };
}

export function durationHours(startTime: string, endTime: string): number {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
}

export function computeBookingTotal(input: BookingPriceInput): number {
    const hours = durationHours(input.startTime, input.endTime);
    if (hours <= 0) return 0;
    return ROUND_2(input.pricePerHour * hours);
}

/**
 * Cap wallet credit at the platform fee size so application_fee never goes
 * negative. Returns the amount we're allowed to spend.
 */
export function capWalletCredit(
    requested: number,
    walletBalance: number,
    totalPrice: number,
    platformFeePercent: number,
): number {
    if (!requested || requested <= 0) return 0;
    const maxRedeemable = ROUND_2(totalPrice * (platformFeePercent / 100));
    return Math.min(requested, walletBalance, maxRedeemable);
}

/**
 * Build the cents-precise amounts we hand to Stripe Checkout. Owner is always
 * whole; platform fee shrinks (or hits zero) when credit is redeemed.
 */
export function computeCheckoutAmounts(
    totalPrice: number,
    appliedCredit: number,
    platformFeePercent: number,
): Omit<CheckoutAmounts, "totalPrice" | "appliedCredit"> {
    const chargeCents = Math.round((totalPrice - appliedCredit) * 100);
    const ownerNetCents = Math.round(totalPrice * (1 - platformFeePercent / 100) * 100);
    const feeCents = Math.max(0, chargeCents - ownerNetCents);
    return { chargeCents, ownerNetCents, feeCents };
}
