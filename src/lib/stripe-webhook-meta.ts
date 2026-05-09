/**
 * Pure helpers for parsing Stripe webhook metadata. Extracted so the
 * recurring-vs-single dispatch logic and the wallet refund amount can be
 * unit-tested without a Supabase mock harness (SAH-110).
 */

export interface CheckoutSessionMeta {
    booking_id?: string;
    availability_id?: string;
    recurring_group_id?: string;
    wallet_credit_applied?: string;
    weeks?: string;
}

export interface ParsedSessionMeta {
    bookingId: string | null;
    availabilityId: string | null;
    recurringGroupId: string | null;
    walletCreditApplied: number;
    weeks: number;
}

export function parseCheckoutSessionMeta(meta: CheckoutSessionMeta | null | undefined): ParsedSessionMeta {
    const wallet = Number(meta?.wallet_credit_applied ?? 0);
    const weeks = Number(meta?.weeks ?? 1);
    return {
        bookingId: meta?.booking_id ?? null,
        availabilityId: meta?.availability_id ?? null,
        recurringGroupId: meta?.recurring_group_id ?? null,
        walletCreditApplied: Number.isFinite(wallet) && wallet > 0 ? wallet : 0,
        weeks: Number.isFinite(weeks) && weeks > 0 ? weeks : 1,
    };
}

/**
 * Whether a Stripe webhook payload represents a recurring series rather
 * than a single booking. Lives here so the test suite can pin the rule
 * down without spinning a Supabase mock.
 */
export function isRecurringSession(meta: CheckoutSessionMeta | null | undefined): boolean {
    return !!meta?.recurring_group_id;
}
