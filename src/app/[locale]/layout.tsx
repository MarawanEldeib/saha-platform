import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { CookieBanner } from "@/components/ui/CookieBanner";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export function generateStaticParams() {
    return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await params;
    return {
        alternates: {
            canonical: `/${locale}`,
            languages: { en: "/en", de: "/de" },
        },
    };
}

export default async function LocaleLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;

    if (!routing.locales.includes(locale as "en" | "de")) {
        notFound();
    }

    const messages = await getMessages();

    // Fetch the current user profile for the Navbar
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    let profile = null;
    if (user) {
        const { data } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();
        profile = data;
    }

    return (
        <NextIntlClientProvider locale={locale} messages={messages}>
            <Navbar profile={profile} />
            <main className="min-h-[calc(100vh-4rem)]">{children}</main>
            <Footer />
            <CookieBanner />
        </NextIntlClientProvider>
    );
}
