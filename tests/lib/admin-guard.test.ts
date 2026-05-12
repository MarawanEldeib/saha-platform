// SAH-161: unit tests for the three-layer assertAdmin() guard
// extracted to lib/admin-guard.ts. Verifies each rejection path
// throws the expected error and emits a Sentry warning.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getUserMock = vi.fn();
const profileSingleMock = vi.fn();
const aalMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({
        auth: {
            getUser: getUserMock,
            mfa: {
                getAuthenticatorAssuranceLevel: aalMock,
            },
        },
        from: () => ({
            select: () => ({
                eq: () => ({
                    single: profileSingleMock,
                }),
            }),
        }),
    }),
}));

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({ __admin: true }),
}));

const captureRouteMessageMock = vi.fn();
vi.mock("@/lib/sentry-helpers", () => ({
    captureRouteMessage: captureRouteMessageMock,
}));

beforeEach(() => {
    getUserMock.mockReset();
    profileSingleMock.mockReset();
    aalMock.mockReset();
    captureRouteMessageMock.mockReset();
});

describe("assertAdmin", () => {
    it("throws Unauthorized when no session user", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
        const { assertAdmin } = await import("@/lib/admin-guard");
        await expect(assertAdmin()).rejects.toThrow(/unauthorized/i);
        expect(captureRouteMessageMock).toHaveBeenCalledWith(
            expect.stringContaining("unauthenticated"),
            expect.objectContaining({ level: "warning" }),
        );
    });

    it("throws Forbidden when profile role is not admin", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null });
        profileSingleMock.mockResolvedValueOnce({ data: { role: "user" }, error: null });
        const { assertAdmin } = await import("@/lib/admin-guard");
        await expect(assertAdmin()).rejects.toThrow(/forbidden/i);
        expect(captureRouteMessageMock).toHaveBeenCalledWith(
            expect.stringContaining("not admin role"),
            expect.objectContaining({ user_id: "u1", level: "warning" }),
        );
    });

    it("throws Forbidden when profile row is missing entirely", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u2" } }, error: null });
        profileSingleMock.mockResolvedValueOnce({ data: null, error: null });
        const { assertAdmin } = await import("@/lib/admin-guard");
        await expect(assertAdmin()).rejects.toThrow(/forbidden/i);
    });

    it("throws when MFA assurance level is below aal2", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u3" } }, error: null });
        profileSingleMock.mockResolvedValueOnce({ data: { role: "admin" }, error: null });
        aalMock.mockResolvedValueOnce({ data: { currentLevel: "aal1", nextLevel: "aal2" } });
        const { assertAdmin } = await import("@/lib/admin-guard");
        await expect(assertAdmin()).rejects.toThrow(/two-factor authentication required/i);
        expect(captureRouteMessageMock).toHaveBeenCalledWith(
            expect.stringContaining("aal2 required"),
            expect.objectContaining({ user_id: "u3", level: "warning" }),
        );
    });

    it("returns clients + identity when all three layers pass", async () => {
        getUserMock.mockResolvedValueOnce({ data: { user: { id: "u4" } }, error: null });
        profileSingleMock.mockResolvedValueOnce({ data: { role: "admin" }, error: null });
        aalMock.mockResolvedValueOnce({ data: { currentLevel: "aal2", nextLevel: "aal2" } });
        const { assertAdmin } = await import("@/lib/admin-guard");
        const result = await assertAdmin();
        expect(result.userId).toBe("u4");
        expect(result.role).toBe("admin");
        expect(result.adminClient).toEqual({ __admin: true });
        expect(captureRouteMessageMock).not.toHaveBeenCalled();
    });
});
