import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { createServerClient } from "@supabase/ssr";

const intlMiddleware = createMiddleware(routing);

const LOCALE_PATTERN = /^\/(en|ar)/;
const AUTH_PROTECTED = ["/dashboard", "/admin"];
const ADMIN_ONLY = ["/admin"];
const BUSINESS_OR_ADMIN = ["/dashboard"];

function stripLocale(pathname: string): string {
    return pathname.replace(LOCALE_PATTERN, "");
}

function matchesAny(pathname: string, patterns: string[]): boolean {
    const stripped = stripLocale(pathname);
    return patterns.some((p) => stripped.startsWith(p));
}

// SAH-109: per-request CSP with a nonce. Next.js auto-threads the nonce to
// its own runtime scripts when it's set on the CSP header AND the request
// header `x-nonce`, so we drop `'unsafe-inline'` from script-src once
// nonces are in place. style-src keeps 'unsafe-inline' — Tailwind + react
// inline-style props are everywhere and the risk model is much lower for
// styles than for scripts.
function buildCsp(nonce: string): string {
    return [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com https://checkout.stripe.com`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https: https://*.supabase.co",
        "font-src 'self' data: https://fonts.openmaptiles.org",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://api.mapbox.com https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://*.tiles.mapbox.com",
        "frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self' https://checkout.stripe.com",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests",
    ].join("; ");
}

function attachCspHeaders(response: NextResponse, nonce: string, csp: string) {
    response.headers.set("Content-Security-Policy", csp);
    response.headers.set("x-nonce", nonce);
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Generate a fresh nonce for every request. Nodes/Edge runtime both
    // expose the Web Crypto API on globalThis.
    const nonce = btoa(crypto.randomUUID());
    const csp = buildCsp(nonce);

    // Make the nonce available to React Server Components via headers().
    // Next.js itself reads x-nonce for its own runtime <script> tags so they
    // pass CSP without us having to thread the nonce manually anywhere.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    const localeFromUrl = pathname.match(LOCALE_PATTERN)?.[1] ?? routing.defaultLocale;
    requestHeaders.set("X-NEXT-INTL-LOCALE", localeFromUrl);

    const intlResponse = intlMiddleware(request);

    if (!matchesAny(pathname, AUTH_PROTECTED)) {
        // intlMiddleware always returns a NextResponse (redirect, rewrite,
        // or next). We pin our headers onto whichever it produced.
        const response = intlResponse;
        attachCspHeaders(response, nonce, csp);
        // Ensure RSCs see x-nonce on the request. We can't mutate the
        // request used by intlMiddleware's response, but we can issue a
        // fresh next() with our augmented headers when intl just passes
        // through — detect that by the absence of a redirect/rewrite.
        if (!response.headers.get("location") && !response.headers.get("x-middleware-rewrite")) {
            const passthrough = NextResponse.next({ request: { headers: requestHeaders } });
            // Copy intl cookies + headers onto our passthrough.
            response.cookies.getAll().forEach((c) => passthrough.cookies.set(c.name, c.value, c));
            attachCspHeaders(passthrough, nonce, csp);
            return passthrough;
        }
        return response;
    }

    const response = intlResponse ?? NextResponse.next({ request: { headers: requestHeaders } });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        request.cookies.set(name, value);
                        response.cookies.set(name, value, options);
                    });
                },
            },
        }
    );

    const { data: { user } } = await supabase.auth.getUser();

    const localeMatch = pathname.match(LOCALE_PATTERN);
    const locale = localeMatch ? localeMatch[1] : "en";

    if (!user) {
        const loginUrl = new URL(`/${locale}/login`, request.url);
        loginUrl.searchParams.set("next", pathname);
        const redirect = NextResponse.redirect(loginUrl);
        attachCspHeaders(redirect, nonce, csp);
        return redirect;
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    const role = (profile as { role: string } | null)?.role ?? "user";

    if (matchesAny(pathname, ADMIN_ONLY) && role !== "admin") {
        const redirect = NextResponse.redirect(new URL(`/${locale}`, request.url));
        attachCspHeaders(redirect, nonce, csp);
        return redirect;
    }

    // SAH-80 bounce-back: admin 2FA is now OPT-IN, not forced at the door.
    // bzo's complaint: "the admin should activate it in the setting not you
    // force him by not letting him enter anywhere or have access till he
    // activate it." Admins can browse /admin pages freely at aal1; the
    // `/admin/settings` 2FA card surfaces the enrolment UI when they're
    // ready. The safety net stays at the action layer — `assertAdmin()`
    // still requires aal2 for every mutating server action, so a
    // never-enrolled admin can read but cannot approve/ban/edit.

    if (matchesAny(pathname, BUSINESS_OR_ADMIN) && role !== "business" && role !== "admin") {
        const redirect = NextResponse.redirect(new URL(`/${locale}`, request.url));
        attachCspHeaders(redirect, nonce, csp);
        return redirect;
    }

    attachCspHeaders(response, nonce, csp);
    return response;
}

export const config = {
    matcher: ["/((?!_next|_vercel|api|icon|apple-icon|opengraph-image|twitter-image|sitemap|robots|manifest|.*\\..*).*)" ],
};
