// SAH-159: unit tests for bookCourtCore — the shared booking primitive
// used by both the dashboard server action and the public REST API.
//
// Scope (Phase 1): the rejection paths + slot-lock race + Stripe-failure
// rollback. The happy-path Stripe call is mocked; the math itself is
// already covered by lib/booking-pricing.test.ts (80+ cases).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "../helpers/supabase-mock";

// ---------------------------------------------------------------------------
// Mocks for every external boundary bookCourtCore touches.
// ---------------------------------------------------------------------------

let mock: SupabaseMock = createSupabaseMock();
let adminMock: SupabaseMock = createSupabaseMock();

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => adminMock.supabase,
}));

const stripeSessionsCreate = vi.fn();
const stripeAccountsRetrieve = vi.fn();
vi.mock("@/lib/stripe", () => ({
    getStripe: () => ({
        checkout: { sessions: { create: stripeSessionsCreate } },
        accounts: { retrieve: stripeAccountsRetrieve },
    }),
}));

vi.mock("@/lib/platform-settings", () => ({
    getPlatformFeePercent: vi.fn(async () => 10),
}));

vi.mock("@/lib/sentry-helpers", () => ({
    captureRouteError: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
    getTranslations: async () => (key: string, vars?: Record<string, unknown>) => {
        if (vars) return `${key}:${JSON.stringify(vars)}`;
        return key;
    },
}));

// Dynamic import after mocks are wired.
async function callBook(opts: {
    userId?: string;
    availabilityId?: string;
    numPlayers?: number;
    creditToApply?: number;
}) {
    const { bookCourtCore } = await import("@/lib/booking-flow");
    return bookCourtCore({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: mock.supabase as any,
        userId: opts.userId ?? "user_1",
        availabilityId: opts.availabilityId ?? "avail_1",
        numPlayers: opts.numPlayers ?? 1,
        creditToApply: opts.creditToApply,
        appUrl: "https://test.local",
        locale: "en",
    });
}

// ---------------------------------------------------------------------------
// Canned response helpers
// ---------------------------------------------------------------------------

function seedHappyPath() {
    mock.setResponse("profiles:select", { data: { role: "user" }, error: null });
    mock.setResponse("court_availability:select", {
        data: {
            id: "avail_1", court_id: "court_1", date: "2026-06-01",
            start_time: "10:00:00", end_time: "11:00:00", is_booked: false,
        },
        error: null,
    });
    mock.setResponse("courts:select", {
        data: {
            id: "court_1", name: "Padel A", price_per_hour: 100, capacity: 4,
            facility_id: "fac_1",
            facilities: { id: "fac_1", name: "Saha HQ", stripe_account_id: "acct_x", currency: "AED" },
        },
        error: null,
    });
    mock.setResponse("court_availability:update", { data: [{ id: "avail_1" }], error: null });
    mock.setResponse("bookings:insert", { data: { id: "booking_1" }, error: null });
    mock.setResponse("payments:insert", { data: null, error: null });
    stripeAccountsRetrieve.mockResolvedValue({ charges_enabled: true, details_submitted: true });
    stripeSessionsCreate.mockResolvedValue({
        url: "https://checkout.stripe/sess_1",
        expires_at: Math.floor(Date.now() / 1000) + 1800,
    });
}

beforeEach(() => {
    mock = createSupabaseMock();
    adminMock = createSupabaseMock();
    stripeSessionsCreate.mockReset();
    stripeAccountsRetrieve.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bookCourtCore", () => {
    describe("happy path", () => {
        it("returns checkoutUrl + bookingId when everything lines up", async () => {
            seedHappyPath();
            const result = await callBook({});
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.bookingId).toBe("booking_1");
                expect(result.checkoutUrl).toBe("https://checkout.stripe/sess_1");
                expect(result.appliedCredit).toBe(0);
            }
        });

        it("locks the slot via CAS update on court_availability", async () => {
            seedHappyPath();
            await callBook({});
            const lockCall = mock.calls.find(
                (c) => c.table === "court_availability" && c.op === "update",
            );
            expect(lockCall).toBeDefined();
            // The CAS chain narrows by id AND is_booked=false
            const eqCalls = lockCall!.chain.filter((c) => c[0] === "eq");
            expect(eqCalls).toContainEqual(["eq", ["id", "avail_1"]]);
            expect(eqCalls).toContainEqual(["eq", ["is_booked", false]]);
        });
    });

    describe("rejection paths", () => {
        it("rejects business accounts (role !== 'user')", async () => {
            mock.setResponse("profiles:select", { data: { role: "business" }, error: null });
            const result = await callBook({});
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error).toMatch(/player account/i);
        });

        it("rejects when the slot doesn't exist", async () => {
            mock.setResponse("profiles:select", { data: { role: "user" }, error: null });
            mock.setResponse("court_availability:select", { data: null, error: null });
            const result = await callBook({});
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error).toMatch(/slot not found/i);
        });

        it("rejects when the slot is already booked (pre-CAS check)", async () => {
            mock.setResponse("profiles:select", { data: { role: "user" }, error: null });
            mock.setResponse("court_availability:select", {
                data: { id: "avail_1", court_id: "court_1", date: "2026-06-01",
                        start_time: "10:00:00", end_time: "11:00:00", is_booked: true },
                error: null,
            });
            const result = await callBook({});
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error).toMatch(/no longer available/i);
        });

        it("rejects when the facility has no Stripe account connected", async () => {
            mock.setResponse("profiles:select", { data: { role: "user" }, error: null });
            mock.setResponse("court_availability:select", {
                data: { id: "avail_1", court_id: "court_1", date: "2026-06-01",
                        start_time: "10:00:00", end_time: "11:00:00", is_booked: false },
                error: null,
            });
            mock.setResponse("courts:select", {
                data: {
                    id: "court_1", name: "Padel A", price_per_hour: 100, capacity: 4,
                    facility_id: "fac_1",
                    facilities: { id: "fac_1", name: "Saha HQ", stripe_account_id: null, currency: "AED" },
                },
                error: null,
            });
            const result = await callBook({});
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error).toMatch(/not yet ready/i);
        });

        it("rejects when the connected Stripe account isn't fully onboarded", async () => {
            seedHappyPath();
            stripeAccountsRetrieve.mockResolvedValue({ charges_enabled: false, details_submitted: true });
            const result = await callBook({});
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error).toMatch(/not yet ready/i);
        });

        it("rejects when Stripe accounts.retrieve throws (network / config error)", async () => {
            seedHappyPath();
            stripeAccountsRetrieve.mockRejectedValue(new Error("stripe down"));
            const result = await callBook({});
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error).toMatch(/could not verify/i);
        });

        it("rejects numPlayers > court capacity", async () => {
            seedHappyPath();
            const result = await callBook({ numPlayers: 99 });
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error).toMatch(/invalid number of players/i);
        });
    });

    describe("CAS race", () => {
        it("releases the slot and returns error when CAS lock returns 0 rows", async () => {
            seedHappyPath();
            mock.setResponse("court_availability:update", { data: [], error: null });
            const result = await callBook({});
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error).toMatch(/no longer available/i);
        });
    });

    describe("Stripe failure rollback", () => {
        it("cancels the booking + releases the slot when Stripe session creation throws", async () => {
            seedHappyPath();
            stripeSessionsCreate.mockRejectedValue(new Error("stripe checkout down"));
            const result = await callBook({});
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error).toMatch(/could not start payment/i);
            // Booking marked cancelled
            const bookingUpdate = mock.calls.find(
                (c) => c.table === "bookings" && c.op === "update",
            );
            expect(bookingUpdate).toBeDefined();
            // Slot released
            const slotUpdates = mock.calls.filter(
                (c) => c.table === "court_availability" && c.op === "update",
            );
            // Two updates total: 1) CAS lock, 2) rollback release
            expect(slotUpdates.length).toBeGreaterThanOrEqual(2);
        });
    });
});
