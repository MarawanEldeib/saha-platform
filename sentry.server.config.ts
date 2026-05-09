// SAH-75: Sentry server init. Server uses SENTRY_DSN (not the public one)
// so we don't ship the server DSN to the browser.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
    Sentry.init({
        dsn,
        tracesSampleRate: 0.1,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
        beforeSend(event) {
            const tags = event.tags ?? {};
            tags.app = "saha";
            event.tags = tags;
            if (event.request?.data) event.request.data = "[redacted]";
            return event;
        },
    });
}
