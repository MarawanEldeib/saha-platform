// SAH-152 Phase 2: tests for the matches server actions.
//
// Covers createMatchAction (auth, role, future-only, happy path),
// joinMatchAction (gates, capacity, already-joined, host-self-join,
// already-started), leaveMatchAction (host can't leave), and
// cancelMatchAction (owner-only, idempotent).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getUserMock = vi.fn();
const profileSingleMock = vi.fn();
const matchSingleMock = vi.fn();
const insertMatchMock = vi.fn();
const insertParticipantMock = vi.fn();
const deleteParticipantMock = vi.fn();
const updateMatchMock = vi.fn();
const participantCountMock = vi.fn();
const insertJoinRequestMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({
        auth: { getUser: getUserMock },
        from: (table: string) => {
            if (table === "profiles") {
                return {
                    select: () => ({
                        eq: () => ({
                            single: profileSingleMock,
                        }),
                    }),
                };
            }
            if (table === "matchmaking_posts") {
                return {
                    select: () => ({
                        eq: () => ({
                            single: matchSingleMock,
                        }),
                    }),
                    insert: () => ({
                        select: () => ({
                            single: insertMatchMock,
                        }),
                    }),
                    update: () => ({
                        eq: updateMatchMock,
                    }),
                };
            }
            if (table === "match_participants") {
                return {
                    select: (_cols: string, opts?: { count?: string; head?: boolean }) =>
                        opts?.head
                            ? { eq: participantCountMock }
                            : { eq: () => ({ in: () => Promise.resolve({ data: [] }) }) },
                    insert: insertParticipantMock,
                    delete: () => ({
                        eq: () => ({ eq: deleteParticipantMock }),
                    }),
                };
            }
            if (table === "match_join_requests") {
                return { insert: insertJoinRequestMock };
            }
            return {};
        },
    }),
}));

const rateLimitMock = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ rateLimit: rateLimitMock }));

vi.mock("@/lib/i18n-errors", () => ({ tr: async (k: string) => k }));

vi.mock("@/lib/sentry-helpers", () => ({
    captureRouteError: vi.fn(),
    captureRouteMessage: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
    getUserMock.mockReset();
    profileSingleMock.mockReset();
    matchSingleMock.mockReset();
    insertMatchMock.mockReset();
    insertParticipantMock.mockReset();
    deleteParticipantMock.mockReset();
    updateMatchMock.mockReset();
    participantCountMock.mockReset();
    rateLimitMock.mockReset();
    insertJoinRequestMock.mockReset();
});

const FUTURE_ISO = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const PAST_ISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function baseInput(overrides: Record<string, unknown> = {}) {
    return {
        title: "Friday padel doubles",
        sport_id: null,
        court_id: null,
        location_text: "Dubai Padel Academy",
        scheduled_for: FUTURE_ISO,
        skill_level: "intermediate" as const,
        format: "casual",
        capacity: 4,
        gate: "open" as const,
        description: "",
        ...overrides,
    };
}

describe("createMatchAction", () => {
    it("rejects when caller is not authenticated", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: null } });
        const { createMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await createMatchAction(baseInput());
        expect(r).toEqual({ ok: false, error: "common.not_authenticated" });
    });

    it("rejects when scheduled_for is in the past", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        const { createMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await createMatchAction(baseInput({ scheduled_for: PAST_ISO }));
        expect(r).toEqual({ ok: false, error: "matches.scheduled_for_past" });
    });

    it("rejects when caller's role is not 'user'", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        profileSingleMock.mockResolvedValueOnce({ data: { role: "business" } });
        const { createMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await createMatchAction(baseInput());
        expect(r.ok).toBe(false);
    });

    it("rejects when rate-limited", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        profileSingleMock.mockResolvedValueOnce({ data: { role: "user" } });
        rateLimitMock.mockResolvedValueOnce({ success: false, retryAfter: 60 });
        const { createMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await createMatchAction(baseInput());
        expect(r.ok).toBe(false);
        expect(insertMatchMock).not.toHaveBeenCalled();
    });

    it("happy path: returns matchId + seats the host", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        profileSingleMock.mockResolvedValueOnce({ data: { role: "user" } });
        rateLimitMock.mockResolvedValueOnce({ success: true, retryAfter: 0 });
        insertMatchMock.mockResolvedValueOnce({ data: { id: "m-1" }, error: null });
        insertParticipantMock.mockResolvedValueOnce({ error: null });
        const { createMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await createMatchAction(baseInput());
        expect(r).toEqual({ ok: true, data: { matchId: "m-1" } });
        expect(insertParticipantMock).toHaveBeenCalled();
    });
});

describe("joinMatchAction", () => {
    it("rejects when not authenticated", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: null } });
        const { joinMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await joinMatchAction("m-1");
        expect(r).toEqual({ ok: false, error: "common.not_authenticated" });
    });

    it("rejects when match is invite-only", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        matchSingleMock.mockResolvedValueOnce({
            data: {
                id: "m-1", status: "open", gate: "invite_only",
                capacity: 4, user_id: "u-host", scheduled_for: FUTURE_ISO,
            },
        });
        const { joinMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await joinMatchAction("m-1");
        expect(r).toEqual({ ok: false, error: "matches.invite_only" });
    });

    it("files a join request when gate is 'request' (Phase 4)", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        matchSingleMock.mockResolvedValueOnce({
            data: {
                id: "m-1", status: "open", gate: "request",
                capacity: 4, user_id: "u-host", scheduled_for: FUTURE_ISO,
            },
        });
        insertJoinRequestMock.mockResolvedValueOnce({ error: null });
        const { joinMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await joinMatchAction("m-1");
        expect(r).toEqual({ ok: true });
        expect(insertJoinRequestMock).toHaveBeenCalled();
    });

    it("translates duplicate join-request as already_pending", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        matchSingleMock.mockResolvedValueOnce({
            data: {
                id: "m-1", status: "open", gate: "request",
                capacity: 4, user_id: "u-host", scheduled_for: FUTURE_ISO,
            },
        });
        insertJoinRequestMock.mockResolvedValueOnce({ error: { code: "23505", message: "dup" } });
        const { joinMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await joinMatchAction("m-1");
        expect(r).toEqual({ ok: false, error: "requests.already_pending" });
    });

    it("rejects the host trying to join their own match", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u-host" } } });
        matchSingleMock.mockResolvedValueOnce({
            data: {
                id: "m-1", status: "open", gate: "open",
                capacity: 4, user_id: "u-host", scheduled_for: FUTURE_ISO,
            },
        });
        const { joinMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await joinMatchAction("m-1");
        expect(r).toEqual({ ok: false, error: "matches.cannot_join_own" });
    });

    it("rejects when match has already started", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        matchSingleMock.mockResolvedValueOnce({
            data: {
                id: "m-1", status: "open", gate: "open",
                capacity: 4, user_id: "u-host", scheduled_for: PAST_ISO,
            },
        });
        const { joinMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await joinMatchAction("m-1");
        expect(r).toEqual({ ok: false, error: "matches.already_started" });
    });

    it("rejects when match is full", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        matchSingleMock.mockResolvedValueOnce({
            data: {
                id: "m-1", status: "open", gate: "open",
                capacity: 4, user_id: "u-host", scheduled_for: FUTURE_ISO,
            },
        });
        participantCountMock.mockResolvedValueOnce({ count: 4 });
        const { joinMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await joinMatchAction("m-1");
        expect(r).toEqual({ ok: false, error: "matches.full" });
    });

    it("happy path: inserts a participant row", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        matchSingleMock.mockResolvedValueOnce({
            data: {
                id: "m-1", status: "open", gate: "open",
                capacity: 4, user_id: "u-host", scheduled_for: FUTURE_ISO,
            },
        });
        participantCountMock.mockResolvedValueOnce({ count: 1 });
        insertParticipantMock.mockResolvedValueOnce({ error: null });
        const { joinMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await joinMatchAction("m-1");
        expect(r).toEqual({ ok: true });
    });

    it("returns already_joined on duplicate-key insert error", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        matchSingleMock.mockResolvedValueOnce({
            data: {
                id: "m-1", status: "open", gate: "open",
                capacity: 4, user_id: "u-host", scheduled_for: FUTURE_ISO,
            },
        });
        participantCountMock.mockResolvedValueOnce({ count: 1 });
        insertParticipantMock.mockResolvedValueOnce({ error: { code: "23505", message: "duplicate" } });
        const { joinMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await joinMatchAction("m-1");
        expect(r).toEqual({ ok: false, error: "matches.already_joined" });
    });
});

describe("leaveMatchAction", () => {
    it("rejects the host trying to leave", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u-host" } } });
        matchSingleMock.mockResolvedValueOnce({ data: { user_id: "u-host" } });
        const { leaveMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await leaveMatchAction("m-1");
        expect(r).toEqual({ ok: false, error: "matches.host_cannot_leave" });
    });

    it("happy path: deletes participant row", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        matchSingleMock.mockResolvedValueOnce({ data: { user_id: "u-host" } });
        deleteParticipantMock.mockResolvedValueOnce({ error: null });
        const { leaveMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await leaveMatchAction("m-1");
        expect(r).toEqual({ ok: true });
    });
});

describe("cancelMatchAction", () => {
    it("rejects non-owner", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        matchSingleMock.mockResolvedValueOnce({ data: { user_id: "u-other", status: "open" } });
        const { cancelMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await cancelMatchAction("m-1");
        expect(r).toEqual({ ok: false, error: "common.forbidden" });
    });

    it("idempotent when match is already cancelled", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u-host" } } });
        matchSingleMock.mockResolvedValueOnce({ data: { user_id: "u-host", status: "cancelled" } });
        const { cancelMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await cancelMatchAction("m-1");
        expect(r).toEqual({ ok: true });
        expect(updateMatchMock).not.toHaveBeenCalled();
    });

    it("happy path: marks status cancelled", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u-host" } } });
        matchSingleMock.mockResolvedValueOnce({ data: { user_id: "u-host", status: "open" } });
        updateMatchMock.mockResolvedValueOnce({ error: null });
        const { cancelMatchAction } = await import("@/app/[locale]/matches/actions");
        const r = await cancelMatchAction("m-1");
        expect(r).toEqual({ ok: true });
        expect(updateMatchMock).toHaveBeenCalled();
    });
});
