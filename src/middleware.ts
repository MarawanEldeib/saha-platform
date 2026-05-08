import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { createServerClient } from "@supabase/ssr";

const intlMiddleware = createMiddleware(routing);

const LOCALE_PATTERN = /^\/(en|de)/;
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

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const intlResponse = intlMiddleware(request);

    if (!matchesAny(pathname, AUTH_PROTECTED)) {
        return intlResponse;
    }

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

    const { data: { user } } = await supabase.auth.getUser();

    const localeMatch = pathname.match(LOCALE_PATTERN);
    const locale = localeMatch ? localeMatch[1] : "en";

    if (!user) {
        const loginUrl = new URL(`/${locale}/login`, request.url);
        loginUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(loginUrl);
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    const role = (profile as { role: string } | null)?.role ?? "user";

    if (matchesAny(pathname, ADMIN_ONLY) && role !== "admin") {
        return NextResponse.redirect(new URL(`/${locale}`, request.url));
    }

    if (matchesAny(pathname, BUSINESS_OR_ADMIN) && role !== "business" && role !== "admin") {
        return NextResponse.redirect(new URL(`/${locale}`, request.url));
    }

    return response;
}

export const config = {
    matcher: ["/((?!_next|_vercel|api|.*\\..*).*)" ],
};
