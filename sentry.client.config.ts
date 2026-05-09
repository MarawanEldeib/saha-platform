// SAH-75: Sentry client init. Only initialises when NEXT_PUBLIC_SENTRY_DSN
// is set so dev / preview without a Sentry project stays free of noise.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
    Sentry.init({
        dsn,
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 1.0,
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
        // PII redaction — emails / phones travel through these payloads.
        beforeSend(event) {
            const tags = event.tags ?? {};
            tags.app = "saha";
            event.tags = tags;
            // Strip request body in case forms contain credentials.
            if (event.request?.data) event.request.data = "[redacted]";
            return event;
        },
    });
}
