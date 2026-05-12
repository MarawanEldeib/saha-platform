// SAH-161: unit tests for messages/actions.ts.
//
// Covers: sendMessageAction guards (auth, self-recipient, length, rate
// limit, RPC failure, happy path) and markMessagesReadAction auth guard.
// Web-push side-effect is silenced.

import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const rpcMock = vi.fn();
const insertMock = vi.fn();
const updateChainMock = vi.fn();
const profileSingleMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({
        auth: { getUser: getUserMock },
        rpc: rpcMock,
        from: (table: string) => {
            if (table === "messages") {
                return {
                    insert: insertMock,
                    update: () => ({
                        eq: () => ({
                            neq: () => ({
                                is: updateChainMock,
                            }),
                        }),
                    }),
                };
            }
            if (table === "profiles") {
                return {
                    select: () => ({
                        eq: () => ({
                            single: profileSingleMock,
                        }),
                    }),
                };
            }
            return {};
        },
    }),
}));

const rateLimitMock = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
    rateLimit: rateLimitMock,
}));

vi.mock("@/lib/web-push", () => ({
    sendPushToUser: vi.fn(async () => undefined),
}));

vi.mock("@/lib/i18n-errors", () => ({
    tr: async (key: string) => key,
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

beforeEach(() => {
    getUserMock.mockReset();
    rpcMock.mockReset();
    insertMock.mockReset();
    updateChainMock.mockReset();
    profileSingleMock.mockReset();
    rateLimitMock.mockReset();
});

describe("sendMessageAction", () => {
    it("rejects when caller is not authenticated", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: null } });
        const { sendMessageAction } = await import("@/app/[locale]/messages/actions");
        const result = await sendMessageAction("other-user", "hello");
        expect(result).toEqual({ ok: false, error: "common.not_authenticated" });
        expect(rpcMock).not.toHaveBeenCalled();
    });

    it("rejects when recipient is the caller themselves", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        const { sendMessageAction } = await import("@/app/[locale]/messages/actions");
        const result = await sendMessageAction("u1", "hello me");
        expect(result).toEqual({ ok: false, error: "messages.cannot_self" });
        expect(rateLimitMock).not.toHaveBeenCalled();
    });

    it("rejects empty body after sanitization", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        const { sendMessageAction } = await import("@/app/[locale]/messages/actions");
        const result = await sendMessageAction("u2", "   ");
        expect(result).toEqual({ ok: false, error: "messages.empty" });
    });

    it("rejects bodies longer than 2000 chars", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        const { sendMessageAction } = await import("@/app/[locale]/messages/actions");
        const result = await sendMessageAction("u2", "x".repeat(2001));
        expect(result).toEqual({ ok: false, error: "messages.too_long" });
    });

    it("rejects when the messages_send rate-limit fires", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        rateLimitMock.mockResolvedValueOnce({ success: false, retryAfter: 42 });
        const { sendMessageAction } = await import("@/app/[locale]/messages/actions");
        const result = await sendMessageAction("u2", "ok body");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/too many/i);
        expect(rpcMock).not.toHaveBeenCalled();
    });

    it("surfaces RPC error from upsert_conversation", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        rateLimitMock.mockResolvedValueOnce({ success: true, retryAfter: 0 });
        rpcMock.mockResolvedValueOnce({ data: null, error: { message: "blocked relationship" } });
        const { sendMessageAction } = await import("@/app/[locale]/messages/actions");
        const result = await sendMessageAction("u2", "ok body");
        expect(result).toEqual({ ok: false, error: "blocked relationship" });
    });

    it("happy path: returns the conversation id", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        rateLimitMock.mockResolvedValueOnce({ success: true, retryAfter: 0 });
        rpcMock.mockResolvedValueOnce({ data: "conv-123", error: null });
        insertMock.mockResolvedValueOnce({ error: null });
        profileSingleMock.mockResolvedValueOnce({ data: { display_name: "Alice" } });
        const { sendMessageAction } = await import("@/app/[locale]/messages/actions");
        const result = await sendMessageAction("u2", "hello there");
        expect(result).toEqual({ ok: true, conversationId: "conv-123" });
    });

    it("surfaces an insert error returned by the messages insert", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        rateLimitMock.mockResolvedValueOnce({ success: true, retryAfter: 0 });
        rpcMock.mockResolvedValueOnce({ data: "conv-9", error: null });
        insertMock.mockResolvedValueOnce({ error: { message: "RLS denied" } });
        const { sendMessageAction } = await import("@/app/[locale]/messages/actions");
        const result = await sendMessageAction("u2", "hello there");
        expect(result).toEqual({ ok: false, error: "RLS denied" });
    });
});

describe("markMessagesReadAction", () => {
    it("returns ok:false when caller is not authenticated", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: null } });
        const { markMessagesReadAction } = await import("@/app/[locale]/messages/actions");
        const result = await markMessagesReadAction("conv-1");
        expect(result).toEqual({ ok: false });
        expect(updateChainMock).not.toHaveBeenCalled();
    });

    it("happy path: returns ok:true and runs the scoped update", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        updateChainMock.mockResolvedValueOnce({ error: null });
        const { markMessagesReadAction } = await import("@/app/[locale]/messages/actions");
        const result = await markMessagesReadAction("conv-1");
        expect(result).toEqual({ ok: true });
    });
});
