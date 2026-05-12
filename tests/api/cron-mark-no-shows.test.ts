// SAH-161: cron route tests for /api/cron/mark-no-shows.
//
// Covers the auth gate (Bearer CRON_SECRET) and the happy-path
// behaviour when there are no bookings to mark. The chained review-prompts
// invocation is mocked out so this test is hermetic.

import { describe, it, expect, vi, beforeEach } from "vitest";

const bookingsSelectMock = vi.fn();
const bookingsUpdateMock = vi.fn();
const profilesSelectMock = vi.fn();
const profilesUpdateMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
        from: (table: string) => {
            if (table === "bookings") {
                return {
                    select: () => ({
                        eq: (_col: string, _val: unknown) => ({
                            eq: () => bookingsSelectMock(),
                        }),
                    }),
                    update: () => ({
                        eq: () => ({
                            eq: bookingsUpdateMock,
                        }),
                    }),
                };
            }
            if (table === "profiles") {
                return {
                    select: () => ({
                        eq: () => ({
                            single: profilesSelectMock,
                        }),
                    }),
                    update: () => ({ eq: profilesUpdateMock }),
                };
            }
            return {};
        },
    }),
}));

vi.mock("@/lib/audit", () => ({
    logAuditEvent: vi.fn(async () => undefined),
}));

vi.mock("@/lib/sentry-helpers", () => ({
    captureRouteError: vi.fn(),
    captureRouteMessage: vi.fn(),
}));

// Stub the chained review-prompts route so the test stays hermetic.
vi.mock("@/app/api/cron/review-prompts/route", () => ({
    GET: vi.fn(async () =>
        new Response(JSON.stringify({ sent: 0, skipped: 0, failed: 0 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        })
    ),
}));

beforeEach(() => {
    bookingsSelectMock.mockReset();
    bookingsUpdateMock.mockReset();
    profilesSelectMock.mockReset();
    profilesUpdateMock.mockReset();
    process.env.CRON_SECRET = "test-cron-secret";
});

function buildRequest(authHeader?: string): Request {
    return new Request("http://localhost/api/cron/mark-no-shows", {
        headers: authHeader ? { authorization: authHeader } : {},
    });
}

describe("GET /api/cron/mark-no-shows", () => {
    it("returns 401 when Authorization header is missing", async () => {
        const { GET } = await import("@/app/api/cron/mark-no-shows/route");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await GET(buildRequest() as any);
        expect(res.status).toBe(401);
    });

    it("returns 401 when Authorization header has the wrong secret", async () => {
        const { GET } = await import("@/app/api/cron/mark-no-shows/route");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await GET(buildRequest("Bearer not-the-real-secret") as any);
        expect(res.status).toBe(401);
    });

    it("happy path: zero bookings yields 200 with marked=0", async () => {
        bookingsSelectMock.mockResolvedValueOnce({ data: [], error: null });
        const { GET } = await import("@/app/api/cron/mark-no-shows/route");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await GET(buildRequest("Bearer test-cron-secret") as any);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.marked).toBe(0);
        expect(body.failed).toBe(0);
        expect(body.players_affected).toBe(0);
    });

    it("marks each booking and increments per-player counter once per player", async () => {
        // Two bookings, same player → counter should be incremented once with +2.
        bookingsSelectMock.mockResolvedValueOnce({
            data: [
                { id: "b1", player_id: "p1" },
                { id: "b2", player_id: "p1" },
                { id: "b3", player_id: "p2" },
            ],
            error: null,
        });
        bookingsUpdateMock.mockResolvedValue({ error: null });
        profilesSelectMock
            .mockResolvedValueOnce({ data: { no_show_count: 0 } })
            .mockResolvedValueOnce({ data: { no_show_count: 5 } });
        profilesUpdateMock.mockResolvedValue({ error: null });

        const { GET } = await import("@/app/api/cron/mark-no-shows/route");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await GET(buildRequest("Bearer test-cron-secret") as any);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.marked).toBe(3);
        expect(body.failed).toBe(0);
        expect(body.players_affected).toBe(2);
        // Two distinct players → profiles.select.single called twice exactly.
        expect(profilesSelectMock).toHaveBeenCalledTimes(2);
        expect(profilesUpdateMock).toHaveBeenCalledTimes(2);
    });
});
