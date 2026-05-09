import twilio from "twilio";

export async function sendWhatsApp(to: string, body: string): Promise<void> {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const from = process.env.TWILIO_WHATSAPP_FROM ?? "whatsapp:+14155238886";
    const phone = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
    await client.messages.create({ from, to: phone, body });
}

// ---------------------------------------------------------------------------
// SAH-79: WhatsApp OTP via Twilio Verify. The Verify service has its own
// rate limiting + brute-force protection — we just hand off the channel
// and the to-phone, Twilio handles delivery, code generation, and check.
// When TWILIO_VERIFY_SERVICE_SID is missing the helpers return a special
// "not_configured" status so the calling code can fall back to "save phone
// but mark unverified" instead of failing the whole profile update.
// ---------------------------------------------------------------------------

export type VerifyStartResult =
    | { status: "pending" | "approved" | "max_attempts_reached"; sid: string }
    | { status: "not_configured" }
    | { status: "error"; message: string };

export type VerifyCheckResult =
    | { status: "approved" }
    | { status: "pending" }
    | { status: "incorrect" }
    | { status: "expired" }
    | { status: "not_configured" }
    | { status: "error"; message: string };

function getVerifyClient() {
    const sid = process.env.TWILIO_VERIFY_SERVICE_SID;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !accountSid || !authToken) return null;
    const client = twilio(accountSid, authToken);
    return { client, serviceSid: sid };
}

export async function startWhatsAppVerification(phoneE164: string): Promise<VerifyStartResult> {
    const ctx = getVerifyClient();
    if (!ctx) return { status: "not_configured" };
    try {
        const verification = await ctx.client.verify.v2
            .services(ctx.serviceSid)
            .verifications.create({ to: phoneE164, channel: "whatsapp" });
        return {
            status: verification.status as "pending" | "approved" | "max_attempts_reached",
            sid: verification.sid,
        };
    } catch (err) {
        return { status: "error", message: err instanceof Error ? err.message : "Twilio Verify failed" };
    }
}

export async function checkWhatsAppVerification(phoneE164: string, code: string): Promise<VerifyCheckResult> {
    const ctx = getVerifyClient();
    if (!ctx) return { status: "not_configured" };
    if (!code || code.length < 4) return { status: "incorrect" };
    try {
        const check = await ctx.client.verify.v2
            .services(ctx.serviceSid)
            .verificationChecks.create({ to: phoneE164, code });
        if (check.status === "approved") return { status: "approved" };
        if (check.status === "pending") return { status: "pending" };
        // Twilio returns a 404 for expired tokens — surfaced as a thrown
        // error in the catch below, but if status comes through as
        // anything else, treat as incorrect.
        return { status: "incorrect" };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Twilio Verify check failed";
        if (/not found/i.test(message) || /expired/i.test(message)) {
            return { status: "expired" };
        }
        return { status: "error", message };
    }
}
