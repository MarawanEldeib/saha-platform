// SAH-75: Sentry edge runtime init (middleware + edge route handlers).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
    Sentry.init({
        dsn,
        tracesSampleRate: 0.05,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    });
}
