import { describe, it, expect } from "vitest";
import { parseCheckoutSessionMeta, isRecurringSession } from "@/lib/stripe-webhook-meta";

describe("parseCheckoutSessionMeta", () => {
    it("returns nulls and defaults when meta is null", () => {
        const out = parseCheckoutSessionMeta(null);
        expect(out.bookingId).toBeNull();
        expect(out.availabilityId).toBeNull();
        expect(out.recurringGroupId).toBeNull();
        expect(out.walletCreditApplied).toBe(0);
        expect(out.weeks).toBe(1);
    });

    it("parses a single-booking session", () => {
        const out = parseCheckoutSessionMeta({
            booking_id: "abc",
            availability_id: "slot-1",
            wallet_credit_applied: "5.5",
        });
        expect(out.bookingId).toBe("abc");
        expect(out.availabilityId).toBe("slot-1");
        expect(out.recurringGroupId).toBeNull();
        expect(out.walletCreditApplied).toBe(5.5);
        expect(out.weeks).toBe(1);
    });

    it("parses a recurring session", () => {
        const out = parseCheckoutSessionMeta({
            booking_id: "first",
            recurring_group_id: "group-uuid",
            weeks: "4",
        });
        expect(out.recurringGroupId).toBe("group-uuid");
        expect(out.weeks).toBe(4);
    });

    it("clamps invalid wallet_credit_applied to 0", () => {
        expect(parseCheckoutSessionMeta({ wallet_credit_applied: "" }).walletCreditApplied).toBe(0);
        expect(parseCheckoutSessionMeta({ wallet_credit_applied: "junk" }).walletCreditApplied).toBe(0);
        expect(parseCheckoutSessionMeta({ wallet_credit_applied: "-5" }).walletCreditApplied).toBe(0);
    });

    it("clamps invalid weeks to 1", () => {
        expect(parseCheckoutSessionMeta({ weeks: "0" }).weeks).toBe(1);
        expect(parseCheckoutSessionMeta({ weeks: "junk" }).weeks).toBe(1);
        expect(parseCheckoutSessionMeta({ weeks: "-3" }).weeks).toBe(1);
    });
});

describe("isRecurringSession", () => {
    it("true when recurring_group_id is set", () => {
        expect(isRecurringSession({ recurring_group_id: "abc" })).toBe(true);
    });
    it("false when recurring_group_id missing", () => {
        expect(isRecurringSession({ booking_id: "abc" })).toBe(false);
    });
    it("false on null/undefined meta", () => {
        expect(isRecurringSession(null)).toBe(false);
        expect(isRecurringSession(undefined)).toBe(false);
    });
});
