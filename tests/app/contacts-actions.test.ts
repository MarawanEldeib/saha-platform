// SAH-152 Phase 3: tests for contacts + groups actions.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getUserMock = vi.fn();
const insertContactMock = vi.fn();
const deleteContactMock = vi.fn();
const searchProfilesMock = vi.fn();
const insertGroupMock = vi.fn();
const insertMembersMock = vi.fn();
const deleteGroupMock = vi.fn();
const updateGroupMock = vi.fn();
const wipeMembersMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({
        auth: { getUser: getUserMock },
        from: (table: string) => {
            if (table === "player_contacts") {
                return {
                    insert: insertContactMock,
                    delete: () => ({
                        eq: () => ({ eq: deleteContactMock }),
                    }),
                };
            }
            if (table === "public_profiles") {
                return {
                    select: () => ({
                        ilike: () => ({
                            eq: () => ({
                                neq: () => ({
                                    limit: searchProfilesMock,
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (table === "player_groups") {
                return {
                    insert: () => ({
                        select: () => ({ single: insertGroupMock }),
                    }),
                    delete: () => ({
                        eq: () => ({ eq: deleteGroupMock }),
                    }),
                    update: () => ({
                        eq: () => ({ eq: updateGroupMock }),
                    }),
                };
            }
            if (table === "player_group_members") {
                return {
                    insert: insertMembersMock,
                    delete: () => ({ eq: wipeMembersMock }),
                };
            }
            return {};
        },
    }),
}));

vi.mock("@/lib/i18n-errors", () => ({ tr: async (k: string) => k }));
vi.mock("@/lib/sentry-helpers", () => ({
    captureRouteError: vi.fn(),
    captureRouteMessage: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
    getUserMock.mockReset();
    insertContactMock.mockReset();
    deleteContactMock.mockReset();
    searchProfilesMock.mockReset();
    insertGroupMock.mockReset();
    insertMembersMock.mockReset();
    deleteGroupMock.mockReset();
    updateGroupMock.mockReset();
    wipeMembersMock.mockReset();
});

describe("addContactAction", () => {
    it("rejects when not authenticated", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: null } });
        const { addContactAction } = await import("@/app/[locale]/players/me/contacts/actions");
        const r = await addContactAction("c1");
        expect(r).toEqual({ ok: false, error: "common.not_authenticated" });
    });

    it("rejects when caller adds themselves", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        const { addContactAction } = await import("@/app/[locale]/players/me/contacts/actions");
        const r = await addContactAction("u1");
        expect(r).toEqual({ ok: false, error: "contacts.cannot_add_self" });
    });

    it("translates duplicate-key error", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        insertContactMock.mockResolvedValueOnce({ error: { code: "23505", message: "dup" } });
        const { addContactAction } = await import("@/app/[locale]/players/me/contacts/actions");
        const r = await addContactAction("c1");
        expect(r).toEqual({ ok: false, error: "contacts.already_added" });
    });

    it("translates foreign-key error to not_found", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        insertContactMock.mockResolvedValueOnce({ error: { code: "23503", message: "fk" } });
        const { addContactAction } = await import("@/app/[locale]/players/me/contacts/actions");
        const r = await addContactAction("c1");
        expect(r).toEqual({ ok: false, error: "contacts.not_found" });
    });

    it("happy path", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        insertContactMock.mockResolvedValueOnce({ error: null });
        const { addContactAction } = await import("@/app/[locale]/players/me/contacts/actions");
        const r = await addContactAction("c1");
        expect(r).toEqual({ ok: true });
    });
});

describe("searchPlayersAction", () => {
    it("rejects when not authenticated", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: null } });
        const { searchPlayersAction } = await import("@/app/[locale]/players/me/contacts/actions");
        const r = await searchPlayersAction("ali");
        expect(r.ok).toBe(false);
    });

    it("returns [] when query is too short", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        const { searchPlayersAction } = await import("@/app/[locale]/players/me/contacts/actions");
        const r = await searchPlayersAction("a");
        expect(r).toEqual({ ok: true, data: [] });
    });

    it("returns hits when query is long enough", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        searchProfilesMock.mockResolvedValueOnce({
            data: [{ id: "p1", display_name: "Alice", avatar_url: null, role: "user" }],
            error: null,
        });
        const { searchPlayersAction } = await import("@/app/[locale]/players/me/contacts/actions");
        const r = await searchPlayersAction("ali");
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.data).toHaveLength(1);
    });
});

describe("createGroupAction", () => {
    it("rejects invalid name", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        const { createGroupAction } = await import("@/app/[locale]/players/me/contacts/actions");
        const r = await createGroupAction("", []);
        expect(r).toEqual({ ok: false, error: "groups.invalid_name" });
    });

    it("happy path: creates group and inserts members", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        insertGroupMock.mockResolvedValueOnce({ data: { id: "g1" }, error: null });
        insertMembersMock.mockResolvedValueOnce({ error: null });
        const { createGroupAction } = await import("@/app/[locale]/players/me/contacts/actions");
        const r = await createGroupAction("Padel crew", ["m1", "m2"]);
        expect(r).toEqual({ ok: true, data: { groupId: "g1" } });
        expect(insertMembersMock).toHaveBeenCalled();
    });

    it("creates group with no members when list is empty", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
        insertGroupMock.mockResolvedValueOnce({ data: { id: "g1" }, error: null });
        const { createGroupAction } = await import("@/app/[locale]/players/me/contacts/actions");
        const r = await createGroupAction("Just me", []);
        expect(r.ok).toBe(true);
        expect(insertMembersMock).not.toHaveBeenCalled();
    });
});
