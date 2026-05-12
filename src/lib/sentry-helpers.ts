/**
 * SAH-157: thin wrappers around Sentry.captureException so call sites stay
 * uniform. Every catch block in critical paths (money, auth, cron, email)
 * should run one of these so prod failures surface in Sentry instead of
 * being swallowed by a bare `console.error`.
 *
 * Pattern is modeled on the rate-limit helpers (`reportBlocked` /
 * `reportBackendError`). The route tag is the single most useful filter
 * in Sentry; structured `extra` is for IDs you'd grep for during triage.
 */

import * as Sentry from "@sentry/nextjs";

export interface SentryContext {
    /** Route tag — e.g. "stripe/webhook", "cron/reminder-emails", "actions:cancelBooking". */
    route: string;
    /** Optional user id for the affected actor. */
    user_id?: string;
    /** Optional structured payload (booking_id, session_id, …). Never returned to client. */
    extra?: Record<string, unknown>;
    /** "error" by default; pass "warning" for non-actionable signals. */
    level?: Sentry.SeverityLevel;
}

/**
 * Capture an exception with a uniform tag shape. Returns the event id so
 * call sites can include it in a fallback log if needed.
 */
export function captureRouteError(err: unknown, ctx: SentryContext): string | undefined {
    return Sentry.captureException(err, {
        level: ctx.level ?? "error",
        tags: { route: ctx.route },
        user: ctx.user_id ? { id: ctx.user_id } : undefined,
        extra: ctx.extra,
    });
}

/**
 * Capture a non-exception message (e.g. "webhook payload missing field")
 * with the same uniform tag shape.
 */
export function captureRouteMessage(message: string, ctx: SentryContext): string | undefined {
    return Sentry.captureMessage(message, {
        level: ctx.level ?? "warning",
        tags: { route: ctx.route },
        user: ctx.user_id ? { id: ctx.user_id } : undefined,
        extra: ctx.extra,
    });
}
