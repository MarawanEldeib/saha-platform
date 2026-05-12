// SAH-159: unit tests for (auth)/actions.ts.
//
// Covers: rate-limit triggers, schema rejection, invalid credentials
// returning a generic error (no user-enumeration), and the redirect
// outcome on the happy path. Supabase auth + email sending are mocked.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — wired before importing the actions module
// ---------------------------------------------------------------------------

const signInWithPasswordMock = vi.fn();
const signUpMock = vi.fn();
const generateLinkMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({
        auth: {
            signInWithPassword: signInWithPasswordMock,
            signUp: signUpMock,
        },
    }),
}));

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
        auth: {
            admin: {
                generateLink: generateLinkMock,
            },
        },
    }),
}));

const rateLimitMock = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
    rateLimit: rateLimitMock,
}));

vi.mock("@/lib/emails/password-reset-email", () => ({
    sendPasswordResetEmail: vi.fn(async () => ({ success: true })),
}));

vi.mock("@/lib/i18n-errors", () => ({
    tr: async (key: string) => key,
}));

vi.mock("next-intl/server", () => ({
    getLocale: async () => "en",
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

const redirectMock = vi.fn((url: string) => {
    // next/navigation throws to interrupt control flow — we mirror that so
    // the test can detect a redirect attempt.
    throw new Error(`__REDIRECT__:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fd(entries: Record<string, string>): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.append(k, v);
    return f;
}

beforeEach(() => {
    signInWithPasswordMock.mockReset();
    signUpMock.mockReset();
    generateLinkMock.mockReset();
    rateLimitMock.mockReset();
    redirectMock.mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loginAction", () => {
    it("returns 429-equivalent when rate-limited", async () => {
        rateLimitMock.mockResolvedValueOnce({ success: false, retryAfter: 120 });
        const { loginAction } = await import("@/app/[locale]/(auth)/actions");
        const result = await loginAction(fd({ email: "a@b.com", password: "secret123" }));
        expect(result?.error).toMatch(/too many/i);
    });

    it("returns a schema error for missing email", async () => {
        rateLimitMock.mockResolvedValueOnce({ success: true, retryAfter: 0 });
        const { loginAction } = await import("@/app/[locale]/(auth)/actions");
        const result = await loginAction(fd({ email: "", password: "secret123" }));
        expect(result?.error).toBeDefined();
        // Schema rejected — Supabase signIn must not have been called
        expect(signInWithPasswordMock).not.toHaveBeenCalled();
    });

    it("returns a generic credentials error (no user-enumeration) when Supabase rejects", async () => {
        rateLimitMock.mockResolvedValueOnce({ success: true, retryAfter: 0 });
        signInWithPasswordMock.mockResolvedValueOnce({
            error: { message: "User not found" },
        });
        const { loginAction } = await import("@/app/[locale]/(auth)/actions");
        const result = await loginAction(fd({ email: "a@b.com", password: "wrongpass" }));
        // We return the translation key, not the raw Supabase message
        expect(result?.error).toBe("auth.invalid_credentials");
        expect(result?.error).not.toMatch(/user not found/i);
    });

    it("redirects on successful login", async () => {
        rateLimitMock.mockResolvedValueOnce({ success: true, retryAfter: 0 });
        signInWithPasswordMock.mockResolvedValueOnce({ error: null, data: {} });
        const { loginAction } = await import("@/app/[locale]/(auth)/actions");
        await expect(
            loginAction(fd({ email: "a@b.com", password: "secret123", locale: "en" })),
        ).rejects.toThrow("__REDIRECT__:/en");
    });

    it("respects the `next` redirect target when provided", async () => {
        rateLimitMock.mockResolvedValueOnce({ success: true, retryAfter: 0 });
        signInWithPasswordMock.mockResolvedValueOnce({ error: null, data: {} });
        const { loginAction } = await import("@/app/[locale]/(auth)/actions");
        await expect(
            loginAction(fd({
                email: "a@b.com", password: "secret123", locale: "en", next: "/en/bookings",
            })),
        ).rejects.toThrow("__REDIRECT__:/en/bookings");
    });
});

describe("registerAction", () => {
    it("returns 429-equivalent when rate-limited", async () => {
        rateLimitMock.mockResolvedValueOnce({ success: false, retryAfter: 600 });
        const { registerAction } = await import("@/app/[locale]/(auth)/actions");
        const result = await registerAction(fd({
            display_name: "Alice", email: "a@b.com",
            password: "Sup3rsecret!", confirm_password: "Sup3rsecret!",
            role: "user",
        }));
        expect(result?.error).toMatch(/too many/i);
        expect(signUpMock).not.toHaveBeenCalled();
    });

    it("returns a schema error for mismatched passwords", async () => {
        rateLimitMock.mockResolvedValueOnce({ success: true, retryAfter: 0 });
        const { registerAction } = await import("@/app/[locale]/(auth)/actions");
        const result = await registerAction(fd({
            display_name: "Alice", email: "a@b.com",
            password: "Sup3rsecret!", confirm_password: "different!",
            role: "user",
        }));
        expect(result?.error).toBeDefined();
        expect(signUpMock).not.toHaveBeenCalled();
    });
});
