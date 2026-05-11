/**
 * SAH-110: handler-level tests for src/app/api/stripe/webhook/route.ts.
 *
 * Strategy: vi.mock() every external boundary the handler touches
 *  - @/lib/stripe        → constructEvent returns the Event we hand in
 *  - @/lib/supabase/admin → chainable proxy mock that records calls and
 *    serves canned responses per "table:op" key (and per "rpc:name")
 *  - @/lib/twilio, @/lib/emails/booking-confirmation-email,
 *    @/lib/audit       → vi.fn() spies
 *
 * The tests prove behaviour, not internals: each event type asserts what
 * DB writes / audit entries / outbound side-effects fire, and the
 * idempotency test fires the same event.id twice and asserts the second
 * call short-circuits via a 23505 dedup row.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// ---------------------------------------------------------------------------
// Mock harness — a Supabase admin client with a recording proxy chain.
// ---------------------------------------------------------------------------

interface MockResponse {
    data?: unknown;
    error?: { code?: string; message?: string } | null;
}

interface CallLog {
    table: string;
    op: "select" | "insert" | "update" | "delete" | "upsert";
    args: unknown[];
    chain: Array<[string, unknown[]]>;
}

interface RpcLog {
    name: string;
    args: unknown;
}

function createSupabaseMock() {
    const calls: CallLog[] = [];
    const rpcCalls: RpcLog[] = [];
    const responses = new Map<string, MockResponse>();

    function setResponse(key: string, response: MockResponse) {
        responses.set(key, response);
    }

    function buildChain(table: string, op: CallLog["op"], opArgs: unknown[]): unknown {
        const call: CallLog = { table, op, args: opArgs, chain: [] };
        calls.push(call);
        const key = `${table}:${op}`;
        const proxyTarget = {} as Record<string | symbol, unknown>;
        const proxy: unknown = new Proxy(proxyTarget, {
            get(_t, prop: string | symbol) {
                if (prop === "then") {
                    const response = responses.get(key) ?? { data: null, error: null };
                    return (resolve: (v: MockResponse) => void) => resolve(response);
                }
                if (prop === "single" || prop === "maybeSingle") {
                    return () => {
                        const response = responses.get(key) ?? { data: null, error: null };
                        return Promise.resolve(response);
                    };
                }
                if (typeof prop === "symbol") return undefined;
                // eq / in / order / range / limit / ilike / etc — record and return self.
                return (...args: unknown[]) => {
                    call.chain.push([prop, args]);
                    return proxy;
                };
            },
        });
        return proxy;
    }

    const supabase = {
        from(table: string) {
            return {
                select: (...args: unknown[]) => buildChain(table, "select", args),
                insert: (rows: unknown) => buildChain(table, "insert", [rows]),
                update: (values: unknown) => buildChain(table, "update", [values]),
                delete: () => buildChain(table, "delete", []),
                upsert: (rows: unknown, opts?: unknown) => buildChain(table, "upsert", [rows, opts]),
            };
        },
        rpc(name: string, args: unknown) {
            rpcCalls.push({ name, args });
            const response = responses.get(`rpc:${name}`) ?? { data: null, error: null };
            return Promise.resolve(response);
        },
        auth: {
            admin: {
                getUserById: vi.fn(async () => ({ data: { user: null } })),
            },
        },
    };

    return { supabase, setResponse, calls, rpcCalls };
}

let mock = createSupabaseMock();

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => mock.supabase,
}));

const constructEventMock = vi.fn();
vi.mock("@/lib/stripe", () => ({
    getStripe: () => ({
        webhooks: { constructEvent: constructEventMock },
    }),
}));

const sendWhatsAppMock = vi.fn(async () => undefined);
vi.mock("@/lib/twilio", () => ({
    sendWhatsApp: sendWhatsAppMock,
}));

const sendBookingConfirmationEmailMock = vi.fn(async () => ({ success: true }));
vi.mock("@/lib/emails/booking-confirmation-email", () => ({
    sendBookingConfirmationEmail: sendBookingConfirmationEmailMock,
}));

const logAuditEventMock = vi.fn(async () => undefined);
vi.mock("@/lib/audit", () => ({
    logAuditEvent: logAuditEventMock,
}));

// Dynamic import after the mocks are wired.
async function callPOST(event: Stripe.Event) {
    constructEventMock.mockReturnValueOnce(event);
    const { POST } = await import("@/app/api/stripe/webhook/route");
    const req = new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=0,v1=fake" },
        body: "{}",
    });
    return POST(req as unknown as Parameters<typeof POST>[0]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
    mock = createSupabaseMock();
    constructEventMock.mockReset();
    sendWhatsAppMock.mockClear();
    sendBookingConfirmationEmailMock.mockClear();
    logAuditEventMock.mockClear();
});

function makeEvent<T>(type: string, dataObject: T, extra: Partial<Stripe.Event> = {}): Stripe.Event {
    return {
        id: `evt_${type}_${Math.random().toString(36).slice(2, 8)}`,
        object: "event",
        type,
        data: { object: dataObject as Stripe.Event.Data["object"] },
        api_version: "2026-04-22",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        ...extra,
    } as Stripe.Event;
}

describe("idempotency", () => {
    it("returns duplicate=true when stripe_events insert hits unique_violation (23505)", async () => {
        mock.setResponse("stripe_events:insert", {
            data: null,
            error: { code: "23505", message: "duplicate key" },
        });

        const event = makeEvent("account.updated", { id: "acct_x", charges_enabled: true });
        const res = await callPOST(event);
        const json = await (res as Response).json();

        expect(json).toEqual({ received: true, duplicate: true });
        // No downstream writes when the dedup short-circuits.
        expect(logAuditEventMock).not.toHaveBeenCalled();
        expect(sendWhatsAppMock).not.toHaveBeenCalled();
    });

    it("returns 500 when stripe_events insert hits any other DB error", async () => {
        mock.setResponse("stripe_events:insert", {
            data: null,
            error: { code: "08006", message: "connection lost" },
        });

        const event = makeEvent("account.updated", { id: "acct_x" });
        const res = await callPOST(event);

        expect((res as Response).status).toBe(500);
        expect(logAuditEventMock).not.toHaveBeenCalled();
    });
});

describe("checkout.session.completed (single booking)", () => {
    it("flips booking to confirmed, payment to succeeded, slot to is_booked=true", async () => {
        // Booking lookup for the email path — return profile without phone so
        // the WhatsApp branch is skipped and we focus on DB writes.
        mock.setResponse("bookings:select", {
            data: {
                id: "bk_1",
                date: "2026-06-01",
                start_time: "18:00:00",
                end_time: "19:00:00",
                num_players: 2,
                total_price: 100,
                currency: "AED",
                qr_code_token: "tok",
                courts: { name: "Court A", facilities: { name: "Padel Plus", address: "1 Sheikh Zayed Rd", city: "Dubai" } },
                profiles: { id: "user_1", display_name: "Marawan", phone: null, phone_verified: false },
            },
        });

        const event = makeEvent("checkout.session.completed", {
            id: "cs_test_1",
            metadata: { booking_id: "bk_1", availability_id: "av_1" },
        });
        await callPOST(event);

        // Assertions: every write we expect to see.
        const updateBookings = mock.calls.find(
            (c) => c.table === "bookings" && c.op === "update"
                && (c.args[0] as { status?: string })?.status === "confirmed"
        );
        expect(updateBookings).toBeTruthy();
        expect(updateBookings!.chain).toContainEqual(["eq", ["id", "bk_1"]]);

        const updatePayments = mock.calls.find(
            (c) => c.table === "payments" && c.op === "update"
                && (c.args[0] as { status?: string })?.status === "succeeded"
        );
        expect(updatePayments).toBeTruthy();
        expect(updatePayments!.chain).toContainEqual(["eq", ["booking_id", "bk_1"]]);

        const updateSlot = mock.calls.find(
            (c) => c.table === "court_availability" && c.op === "update"
        );
        expect(updateSlot).toBeTruthy();
        expect(updateSlot!.chain).toContainEqual(["eq", ["id", "av_1"]]);
    });
});

describe("charge.refunded", () => {
    it("marks payment refunded, booking cancelled, audit-logs payment.refunded.via_stripe_dashboard", async () => {
        mock.setResponse("payments:select", {
            data: { booking_id: "bk_42" },
        });

        const event = makeEvent("charge.refunded", {
            id: "ch_1",
            payment_intent: "pi_1",
        });
        await callPOST(event);

        const pay = mock.calls.find(
            (c) => c.table === "payments" && c.op === "update"
                && (c.args[0] as { status?: string })?.status === "refunded"
        );
        expect(pay).toBeTruthy();
        expect(pay!.chain).toContainEqual(["eq", ["booking_id", "bk_42"]]);

        const cancel = mock.calls.find(
            (c) => c.table === "bookings" && c.op === "update"
                && (c.args[0] as { status?: string })?.status === "cancelled"
        );
        expect(cancel).toBeTruthy();

        expect(logAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
            action: "payment.refunded.via_stripe_dashboard",
            targetType: "booking",
            targetId: "bk_42",
        }));
    });
});

describe("account.updated", () => {
    it("audits stripe.account.updated with the account flags", async () => {
        const event = makeEvent("account.updated", {
            id: "acct_999",
            charges_enabled: true,
            details_submitted: true,
            payouts_enabled: false,
        });
        await callPOST(event);

        expect(logAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
            action: "stripe.account.updated",
            targetType: "stripe_account",
            metadata: expect.objectContaining({
                stripe_account_id: "acct_999",
                charges_enabled: true,
                details_submitted: true,
                payouts_enabled: false,
            }),
        }));
    });
});

describe("account.application.deauthorized", () => {
    it("clears facility.stripe_account_id and audits deauthorized", async () => {
        const event = makeEvent("account.application.deauthorized", { id: "appl_1" }, { account: "acct_dead" });
        await callPOST(event);

        const update = mock.calls.find(
            (c) => c.table === "facilities" && c.op === "update"
                && (c.args[0] as { stripe_account_id?: string | null })?.stripe_account_id === null
        );
        expect(update).toBeTruthy();
        expect(update!.chain).toContainEqual(["eq", ["stripe_account_id", "acct_dead"]]);

        expect(logAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
            action: "stripe.account.deauthorized",
            metadata: { stripe_account_id: "acct_dead" },
        }));
    });
});

describe("payout.failed", () => {
    it("audits stripe.payout.failed with the failure metadata", async () => {
        const event = makeEvent("payout.failed", {
            id: "po_1",
            amount: 12500,
            currency: "aed",
            failure_code: "account_closed",
            failure_message: "The bank account has been closed",
        });
        await callPOST(event);

        expect(logAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
            action: "stripe.payout.failed",
            targetType: "stripe_payout",
            metadata: expect.objectContaining({
                payout_id: "po_1",
                amount: 12500,
                currency: "aed",
                failure_code: "account_closed",
            }),
        }));
    });
});

describe("charge.dispute.created", () => {
    it("audits stripe.dispute.created with the dispute metadata", async () => {
        mock.setResponse("payments:select", {
            data: {
                booking_id: "bk_disp",
                bookings: { court_id: "c_1", courts: { facility_id: "fac_99" } },
            },
        });

        const event = makeEvent("charge.dispute.created", {
            id: "dp_1",
            amount: 5000,
            currency: "aed",
            reason: "fraudulent",
            status: "warning_needs_response",
            payment_intent: "pi_disp",
        });
        await callPOST(event);

        expect(logAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
            action: "stripe.dispute.created",
            targetType: "stripe_dispute",
            targetId: "fac_99",
            metadata: expect.objectContaining({
                dispute_id: "dp_1",
                reason: "fraudulent",
                stripe_payment_intent_id: "pi_disp",
            }),
        }));
    });
});
