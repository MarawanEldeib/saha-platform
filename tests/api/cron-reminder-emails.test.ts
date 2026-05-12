// SAH-161: auth-gate test for /api/cron/reminder-emails. Behaviour
// of the email/whatsapp send loop is verified end-to-end in staging;
// here we just guarantee the gate is wired.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({ from: () => ({}) }),
}));
vi.mock("@/lib/twilio", () => ({ sendWhatsApp: vi.fn() }));
vi.mock("resend", () => ({
    Resend: class {
        emails = { send: vi.fn(async () => ({ error: null })) };
    },
}));
vi.mock("@/lib/sentry-helpers", () => ({
    captureRouteError: vi.fn(),
    captureRouteMessage: vi.fn(),
}));
vi.mock("@/lib/email-config", () => ({
    FROM_ADDRESS: "Saha <test@example.com>",
}));

beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
});

function buildRequest(authHeader?: string): Request {
    return new Request("http://localhost/api/cron/reminder-emails", {
        headers: authHeader ? { authorization: authHeader } : {},
    });
}

describe("GET /api/cron/reminder-emails", () => {
    it("returns 401 when Authorization header is missing", async () => {
        const { GET } = await import("@/app/api/cron/reminder-emails/route");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await GET(buildRequest() as any);
        expect(res.status).toBe(401);
    });

    it("returns 401 when Authorization header has the wrong secret", async () => {
        const { GET } = await import("@/app/api/cron/reminder-emails/route");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await GET(buildRequest("Bearer wrong-secret") as any);
        expect(res.status).toBe(401);
    });
});
