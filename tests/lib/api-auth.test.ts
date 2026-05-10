import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// We mock the Supabase client modules so the auth helper can be tested
// without a live Supabase instance. The helper has two paths — Bearer
// header and cookie session — and we cover both plus the failure modes.

const cookieGetUser = vi.fn();
const bearerGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({
        auth: { getUser: cookieGetUser },
    }),
}));

vi.mock("@supabase/ssr", () => ({
    createServerClient: () => ({
        auth: { getUser: bearerGetUser },
    }),
}));

// Import after the mocks are wired so the module captures them.
import { getApiUser } from "@/lib/api-auth";

function makeReq(headers: Record<string, string> = {}): NextRequest {
    return {
        headers: new Headers(headers),
    } as unknown as NextRequest;
}

beforeEach(() => {
    cookieGetUser.mockReset();
    bearerGetUser.mockReset();
});

describe("getApiUser — Bearer path", () => {
    it("returns user when the JWT resolves", async () => {
        bearerGetUser.mockResolvedValueOnce({
            data: { user: { id: "user-1", email: "a@b.com" } },
            error: null,
        });
        const req = makeReq({ Authorization: "Bearer valid-jwt" });
        const out = await getApiUser(req);
        expect(out).not.toBeNull();
        expect(out?.user.id).toBe("user-1");
        expect(out?.source).toBe("bearer");
    });

    it("returns null when the JWT is rejected", async () => {
        bearerGetUser.mockResolvedValueOnce({
            data: { user: null },
            error: { message: "invalid jwt" },
        });
        const req = makeReq({ Authorization: "Bearer bad-jwt" });
        expect(await getApiUser(req)).toBeNull();
    });

    it("trims whitespace and accepts case-insensitive 'Bearer'", async () => {
        bearerGetUser.mockResolvedValueOnce({
            data: { user: { id: "user-2" } },
            error: null,
        });
        const req = makeReq({ authorization: "  bearer  abc.def.ghi  " });
        const out = await getApiUser(req);
        expect(out?.user.id).toBe("user-2");
        // Cookie path must NOT have been consulted.
        expect(cookieGetUser).not.toHaveBeenCalled();
    });

    it("ignores non-Bearer Authorization schemes", async () => {
        cookieGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
        const req = makeReq({ Authorization: "Basic dXNlcjpwYXNz" });
        const out = await getApiUser(req);
        // Falls through to cookie path; cookie path returns null → null overall.
        expect(out).toBeNull();
        expect(bearerGetUser).not.toHaveBeenCalled();
        expect(cookieGetUser).toHaveBeenCalledOnce();
    });
});

describe("getApiUser — cookie path", () => {
    it("returns user when the cookie session is valid", async () => {
        cookieGetUser.mockResolvedValueOnce({
            data: { user: { id: "user-3" } },
            error: null,
        });
        const out = await getApiUser(makeReq());
        expect(out?.user.id).toBe("user-3");
        expect(out?.source).toBe("cookie");
    });

    it("returns null when no cookie session exists", async () => {
        cookieGetUser.mockResolvedValueOnce({
            data: { user: null },
            error: null,
        });
        expect(await getApiUser(makeReq())).toBeNull();
    });
});

describe("getApiUser — preference order", () => {
    it("prefers Bearer over cookie when both are present", async () => {
        bearerGetUser.mockResolvedValueOnce({
            data: { user: { id: "bearer-user" } },
            error: null,
        });
        cookieGetUser.mockResolvedValueOnce({
            data: { user: { id: "cookie-user" } },
            error: null,
        });
        const req = makeReq({ Authorization: "Bearer abc" });
        const out = await getApiUser(req);
        expect(out?.user.id).toBe("bearer-user");
        expect(out?.source).toBe("bearer");
        expect(cookieGetUser).not.toHaveBeenCalled();
    });
});
