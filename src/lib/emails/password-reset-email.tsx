/**
 * SAH-133: Saha-branded password reset email.
 *
 * Sent via Resend, FROM `Saha <noreply@saha.ae>` — no Supabase branding.
 * The recovery URL is generated server-side using
 * `auth.admin.generateLink({ type: 'recovery' })` so Supabase never sends
 * its own email.
 */

interface PasswordResetEmailProps {
    recipientEmail: string;
    recipientName: string | null;
    /** Full URL Supabase issued (already locale-prefixed by callerflow). */
    recoveryUrl: string;
    /** Locale string used in copy. Defaults to en. */
    locale?: string;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function generatePasswordResetEmail(props: PasswordResetEmailProps): string {
    const { recipientName, recoveryUrl, locale = "en" } = props;
    const isAr = locale === "ar";
    const dir = isAr ? "rtl" : "ltr";

    const t = isAr
        ? {
            previewText: "أعد تعيين كلمة مرور حساب سها",
            greeting: recipientName ? `مرحباً ${recipientName}،` : "مرحباً،",
            line1: "تلقّينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك في سها.",
            cta: "إعادة تعيين كلمة المرور",
            expiry: "ينتهي هذا الرابط خلال ساعة واحدة لأسباب أمنية.",
            ignore: "إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة بأمان — لن يتغيّر شيء في حسابك.",
            fallback: "إذا لم يعمل الزر، انسخ هذا الرابط والصقه في متصفحك:",
            footer: "صحة — احجز ملاعب الرياضات المضربية في الإمارات.",
            address: "Saha · Dubai, United Arab Emirates",
        }
        : {
            previewText: "Reset your Saha account password",
            greeting: recipientName ? `Hi ${recipientName},` : "Hi there,",
            line1: "We received a request to reset the password for your Saha account.",
            cta: "Reset password",
            expiry: "This link expires in 1 hour for security.",
            ignore: "If you didn't request a reset, you can safely ignore this email — your account is unchanged.",
            fallback: "If the button doesn't work, copy and paste this link into your browser:",
            footer: "Saha — book racket-sport courts in the UAE.",
            address: "Saha · Dubai, United Arab Emirates",
        };

    const greeting = escapeHtml(t.greeting);
    const safeUrl = escapeHtml(recoveryUrl);

    return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(t.previewText)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(t.previewText)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f9f7;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <tr>
        <td style="padding:28px 32px 16px 32px;text-align:${isAr ? "right" : "left"};">
          <div style="display:inline-flex;align-items:center;gap:8px;">
            <div style="width:32px;height:32px;background:#10b981;border-radius:6px;color:white;font-weight:800;font-size:18px;line-height:32px;text-align:center;">S</div>
            <span style="font-size:18px;font-weight:700;color:#059669;letter-spacing:-0.01em;">Saha</span>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 32px 0 32px;text-align:${isAr ? "right" : "left"};">
          <h1 style="margin:0 0 12px 0;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.01em;">${escapeHtml(t.previewText)}</h1>
          <p style="margin:0 0 12px 0;color:#374151;line-height:1.55;">${greeting}</p>
          <p style="margin:0 0 22px 0;color:#374151;line-height:1.55;">${escapeHtml(t.line1)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td>
              <a href="${safeUrl}" style="display:inline-block;padding:12px 24px;background:#059669;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;">${escapeHtml(t.cta)}</a>
            </td></tr>
          </table>
          <p style="margin:18px 0 0 0;color:#6b7280;font-size:13px;line-height:1.55;">${escapeHtml(t.expiry)}</p>
          <p style="margin:8px 0 24px 0;color:#6b7280;font-size:13px;line-height:1.55;">${escapeHtml(t.ignore)}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px 0;" />
          <p style="margin:0 0 8px 0;color:#9ca3af;font-size:12px;line-height:1.55;">${escapeHtml(t.fallback)}</p>
          <p style="margin:0 0 24px 0;color:#374151;font-size:12px;line-height:1.55;word-break:break-all;"><a href="${safeUrl}" style="color:#059669;">${safeUrl}</a></p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 28px 32px;text-align:${isAr ? "right" : "left"};">
          <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.55;">${escapeHtml(t.footer)}</p>
          <p style="margin:4px 0 0 0;color:#9ca3af;font-size:11px;line-height:1.55;">${escapeHtml(t.address)}</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/**
 * Send the reset email via Resend. Returns { success } / { success:false, error }.
 * Caller should not block the user-facing response on this — call fire-and-forget.
 */
export async function sendPasswordResetEmail(
    props: PasswordResetEmailProps & { resendApiKey?: string }
): Promise<{ success: boolean; error?: string }> {
    const { captureRouteError } = await import("@/lib/sentry-helpers");
    try {
        const { resendApiKey, ...emailProps } = props;
        const html = generatePasswordResetEmail(emailProps);
        const { Resend } = await import("resend");
        const resend = new Resend(resendApiKey || process.env.RESEND_API_KEY);

        const subject = props.locale === "ar"
            ? "أعد تعيين كلمة مرور حساب سها"
            : "Reset your Saha password";

        const result = await resend.emails.send({
            from: "Saha <noreply@saha.ae>",
            to: props.recipientEmail,
            subject,
            html,
        });

        if (result.error) {
            captureRouteError(result.error, {
                route: "emails:password-reset",
                level: "error",
                extra: { recipient: props.recipientEmail },
            });
            return { success: false, error: result.error.message };
        }
        return { success: true };
    } catch (err) {
        captureRouteError(err, {
            route: "emails:password-reset",
            level: "error",
            extra: { recipient: props.recipientEmail },
        });
        return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
}
