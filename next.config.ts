import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Static security headers. Content-Security-Policy lives in middleware
// (`src/proxy.ts`) so we can issue a per-request nonce and drop
// 'unsafe-inline' for scripts (SAH-109).
const securityHeaders = [
    {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
    },
];

const nextConfig: NextConfig = {
    reactCompiler: true,
    allowedDevOrigins: ["127.0.0.1"],
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "*.supabase.co",
                pathname: "/storage/v1/object/public/**",
            },
            {
                // Google profile pictures from OAuth (SAH-115).
                protocol: "https",
                hostname: "*.googleusercontent.com",
            },
        ],
    },
    async headers() {
        return [
            {
                source: "/:path*",
                headers: securityHeaders,
            },
        ];
    },
};

// SAH-75: Sentry wrapping is a no-op at runtime when DSN env vars are
// missing. Build still succeeds without SENTRY_AUTH_TOKEN; source-map
// upload is skipped silently. Setting `silent: true` avoids the warning.
export default withSentryConfig(withNextIntl(nextConfig), {
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    tunnelRoute: "/monitoring",
    // Don't fail the build if source-map upload errors.
    sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
