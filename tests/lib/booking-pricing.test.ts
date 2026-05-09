import { describe, it, expect } from "vitest";
import {
    durationHours,
    computeBookingTotal,
    capWalletCredit,
    computeCheckoutAmounts,
    isWithinCancellationRefundWindow,
} from "@/lib/booking-pricing";

describe("durationHours", () => {
    it("returns 1 for 09:00–10:00", () => {
        expect(durationHours("09:00", "10:00")).toBe(1);
    });
    it("returns 1.5 for 18:30–20:00", () => {
        expect(durationHours("18:30", "20:00")).toBe(1.5);
    });
    it("returns 0 when end equals start", () => {
        expect(durationHours("09:00", "09:00")).toBe(0);
    });
    it("returns negative for inverted slot (caller validates)", () => {
        expect(durationHours("10:00", "09:00")).toBe(-1);
    });
});

describe("computeBookingTotal", () => {
    it("multiplies price/hr by duration", () => {
        expect(computeBookingTotal({
            pricePerHour: 100,
            startTime: "09:00",
            endTime: "10:30",
        })).toBe(150);
    });
    it("rounds to 2 decimals", () => {
        expect(computeBookingTotal({
            pricePerHour: 33.333,
            startTime: "09:00",
            endTime: "10:00",
        })).toBe(33.33);
    });
    it("returns 0 for zero/negative durations", () => {
        expect(computeBookingTotal({
            pricePerHour: 100,
            startTime: "09:00",
            endTime: "09:00",
        })).toBe(0);
        expect(computeBookingTotal({
            pricePerHour: 100,
            startTime: "10:00",
            endTime: "09:00",
        })).toBe(0);
    });
});

describe("capWalletCredit", () => {
    it("caps at platform fee (10% of total) — owner stays whole", () => {
        // total 100, requested 20, balance 50 → cap at 10
        expect(capWalletCredit(20, 50, 100, 10)).toBe(10);
    });
    it("never exceeds wallet balance", () => {
        // total 100, requested 50, balance 5 → 5
        expect(capWalletCredit(50, 5, 100, 10)).toBe(5);
    });
    it("never exceeds the requested amount", () => {
        // total 100, requested 3, balance 50 → 3
        expect(capWalletCredit(3, 50, 100, 10)).toBe(3);
    });
    it("returns 0 when requested is null/undefined/zero", () => {
        expect(capWalletCredit(0, 50, 100, 10)).toBe(0);
        expect(capWalletCredit(undefined as unknown as number, 50, 100, 10)).toBe(0);
        expect(capWalletCredit(-5, 50, 100, 10)).toBe(0);
    });
    it("respects fractional platform fee percentages", () => {
        // total 200, fee 7.5% → max 15
        expect(capWalletCredit(50, 50, 200, 7.5)).toBe(15);
    });
});

describe("isWithinCancellationRefundWindow", () => {
    // Both `now` and `bookingDate` use local-time strings so the test runs
    // identically regardless of TZ. Production code parses booking.date the
    // same way (no Z), so this matches the real behaviour.
    const now = new Date("2026-05-09T10:00:00");

    it("returns true when booking is more than 24h away", () => {
        // 2026-05-10 11:00 local = 25h away from now
        const result = isWithinCancellationRefundWindow("2026-05-10", "11:00:00", now);
        expect(result.withinWindow).toBe(true);
        expect(result.hoursUntil).toBeCloseTo(25, 0);
    });

    it("returns false at exactly 24h", () => {
        const result = isWithinCancellationRefundWindow("2026-05-10", "10:00:00", now);
        expect(result.withinWindow).toBe(false);
    });

    it("returns false when booking is in the past", () => {
        const result = isWithinCancellationRefundWindow("2026-05-08", "10:00:00", now);
        expect(result.withinWindow).toBe(false);
        expect(result.hoursUntil).toBeLessThan(0);
    });

    it("handles HH:MM (no seconds)", () => {
        const result = isWithinCancellationRefundWindow("2026-05-10", "11:00", now);
        expect(result.withinWindow).toBe(true);
    });
});

describe("computeCheckoutAmounts", () => {
    const FEE_PCT = 10;

    it("no credit applied — owner gets 90%, platform 10%", () => {
        const { chargeCents, ownerNetCents, feeCents } =
            computeCheckoutAmounts(100, 0, FEE_PCT);
        expect(chargeCents).toBe(10000);
        expect(ownerNetCents).toBe(9000);
        expect(feeCents).toBe(1000);
    });

    it("credit < platform fee — owner stays whole, platform absorbs", () => {
        // total 100, credit 5 → charge 95, owner 90, fee 5
        const { chargeCents, ownerNetCents, feeCents } =
            computeCheckoutAmounts(100, 5, FEE_PCT);
        expect(chargeCents).toBe(9500);
        expect(ownerNetCents).toBe(9000);
        expect(feeCents).toBe(500);
    });

    it("credit equals platform fee — owner whole, platform 0", () => {
        // total 100, credit 10 → charge 90, owner 90, fee 0
        const { chargeCents, ownerNetCents, feeCents } =
            computeCheckoutAmounts(100, 10, FEE_PCT);
        expect(chargeCents).toBe(9000);
        expect(ownerNetCents).toBe(9000);
        expect(feeCents).toBe(0);
    });

    it("credit > platform fee should never happen post-cap, but stays non-negative", () => {
        // total 100, credit 15 → charge 85, owner 90, fee max(0, 85-90) = 0.
        // The owner would actually under-collect here, which is why the cap
        // helper exists — but the math itself must not produce a negative
        // application_fee_amount that Stripe would reject.
        const { feeCents } = computeCheckoutAmounts(100, 15, FEE_PCT);
        expect(feeCents).toBe(0);
    });
});
