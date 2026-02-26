import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { createServerClient } from "@supabase/ssr";

const intlMiddleware = createMiddleware(routing);

// Protected route patterns (require authentication)
const authProtectedPatterns = ["/dashboard", "/admin"];
// Admin-only routes
const adminOnlyPatterns = ["/admin"];
// Business-only routes
const businessOnlyPatterns = ["/dashboard"];

function isProtected(pathname: string): boolean {
    const stripped = pathname.replace(/^\/(en|de)/, "");
    return authProtectedPatterns.some((p) => stripped.startsWith(p));
}

function isAdminOnly(pathname: string): boolean {
    const stripped = pathname.replace(/^\/(en|de)/, "");
    return adminOnlyPatterns.some((p) => stripped.startsWith(p));
}

function isBusinessOnly(pathname: string): boolean {
    const stripped = pathname.replace(/^\/(en|de)/, "");
    return businessOnlyPatterns.some((p) => stripped.startsWith(p));
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Run i18n middleware first to get locale-prefixed URLs
    const intlResponse = intlMiddleware(request);

    // Only guard protected routes
    if (!isProtected(pathname)) {
        return intlResponse;
    }

    // Create Supabase SSR client to read session from cookies
    const response = intlResponse ?? NextResponse.next({ request });

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

    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Determine locale from pathname for redirect URLs
    const localeMatch = pathname.match(/^\/(en|de)/);
    const locale = localeMatch ? localeMatch[1] : "en";

    if (!user) {
        const loginUrl = new URL(`/${locale}/login`, request.url);
        loginUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Fetch user role from profiles
    const profileResult = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    const role = (profileResult.data as { role: string } | null)?.role ?? "user";

    if (isAdminOnly(pathname) && role !== "admin") {
        return NextResponse.redirect(new URL(`/${locale}`, request.url));
    }

    if (isBusinessOnly(pathname) && role !== "business" && role !== "admin") {
        return NextResponse.redirect(new URL(`/${locale}`, request.url));
    }

    return response;
}

export const config = {
    matcher: [
        // Match all pathnames except static files and Next.js internals
        "/((?!_next|_vercel|.*\\..*).*)"],
};
