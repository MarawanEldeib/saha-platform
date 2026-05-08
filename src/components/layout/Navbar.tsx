"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { MapPin, Menu, X, LogOut, LayoutDashboard, ShieldCheck, CalendarDays, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

interface NavbarProps {
    profile?: Profile | null;
}

// Shared class helpers — avoid asChild + Slot to prevent React.Children.only errors
const navBtnBase =
    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
const ghostBtn = cn(navBtnBase, "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 focus-visible:ring-gray-400");
const primaryBtn = cn(navBtnBase, "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500 shadow-sm");

export function Navbar({ profile }: NavbarProps) {
    const t = useTranslations("nav");
    const locale = useLocale();
    const pathname = usePathname();
    const router = useRouter();
    const [menuOpen, setMenuOpen] = React.useState(false);

    const navLinks = [
        { href: `/${locale}/map`, label: t("map") },
        { href: `/${locale}/community`, label: t("community") },
        { href: `/${locale}/events`, label: t("events") },
    ];

    const localeOptions = [
        { value: "en", label: "English" },
        { value: "ar", label: "العربية" },
    ];

    const getPathWithLocale = (nextLocale: string) => {
        const withoutLocale = pathname.replace(new RegExp(`^/${locale}(?=/|$)`), "");
        return withoutLocale ? `/${nextLocale}${withoutLocale}` : `/${nextLocale}`;
    };

    const handleLocaleChange = (nextLocale: string) => {
        if (nextLocale === locale) return;
        router.push(getPathWithLocale(nextLocale));
        router.refresh();
    };

    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push(`/${locale}`);
        router.refresh();
    };

    return (
        <header className="sticky top-0 z-40 w-full bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between">
                    {/* Logo */}
                    <Link
                        href={`/${locale}`}
                        className="flex items-center gap-2 font-bold text-xl text-emerald-600 dark:text-emerald-400 hover:opacity-80 transition-opacity"
                    >
                        <MapPin className="h-5 w-5" />
                        Saha
                    </Link>

                    {/* Desktop Nav */}
                    <nav className="hidden md:flex items-center gap-1">
                        {navLinks.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={cn(
                                    "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                    pathname.startsWith(link.href)
                                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                        : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                                )}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>

                    {/* Right Actions */}
                    <div className="hidden md:flex items-center gap-3">
                        <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                            {localeOptions.map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => handleLocaleChange(option.value)}
                                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                                        locale === option.value
                                            ? "bg-emerald-600 text-white"
                                            : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                                    }`}
                                    aria-label={option.label}
                                >
                                    {option.value.toUpperCase()}
                                </button>
                            ))}
                        </div>
                        {profile ? (
                            <>
                                {profile.role === "admin" && (
                                    <Link href={`/${locale}/admin`} className={ghostBtn}>
                                        <ShieldCheck className="h-4 w-4" />
                                        {t("admin")}
                                    </Link>
                                )}
                                {(profile.role === "business" || profile.role === "admin") && (
                                    <Link href={`/${locale}/dashboard`} className={ghostBtn}>
                                        <LayoutDashboard className="h-4 w-4" />
                                        {t("dashboard")}
                                    </Link>
                                )}
                                {profile.role === "user" && (
                                    <>
                                        <Link href={`/${locale}/bookings`} className={ghostBtn}>
                                            <CalendarDays className="h-4 w-4" />
                                            {t("bookings")}
                                        </Link>
                                    </>
                                )}
                                <Link
                                    href={`/${locale}/account/settings`}
                                    className="shrink-0 w-8 h-8 rounded-full overflow-hidden bg-emerald-100 dark:bg-emerald-900/30 border border-gray-200 dark:border-gray-700 hover:ring-2 hover:ring-emerald-500 hover:ring-offset-1 transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
                                    aria-label={t("settings")}
                                >
                                    {profile.avatar_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 select-none">
                                            {profile.display_name?.trim().split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"}
                                        </span>
                                    )}
                                </Link>
                                <button
                                    onClick={handleLogout}
                                    className={ghostBtn}
                                >
                                    <LogOut className="h-4 w-4" />
                                    {t("logout")}
                                </button>
                            </>
                        ) : (
                            <>
                                <Link href={`/${locale}/login`} className={ghostBtn}>
                                    {t("login")}
                                </Link>
                                <Link href={`/${locale}/register`} className={primaryBtn}>
                                    {t("register")}
                                </Link>
                            </>
                        )}
                    </div>

                    {/* Mobile hamburger */}
                    <button
                        className="md:hidden p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        onClick={() => setMenuOpen(!menuOpen)}
                        aria-label="Toggle menu"
                        aria-expanded={menuOpen}
                    >
                        {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>
                </div>
            </div>

            {/* Mobile menu */}
            {menuOpen && (
                <div className="md:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 py-3 space-y-1">
                    <div className="px-3 py-2 flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{t("language")}</span>
                        <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                            {localeOptions.map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => { handleLocaleChange(option.value); setMenuOpen(false); }}
                                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                                        locale === option.value
                                            ? "bg-emerald-600 text-white"
                                            : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                                    }`}
                                >
                                    {option.value.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                    {navLinks.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => setMenuOpen(false)}
                            className={cn(
                                "block px-3 py-2 rounded-lg text-sm font-medium",
                                pathname.startsWith(link.href)
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                            )}
                        >
                            {link.label}
                        </Link>
                    ))}
                    <div className="pt-2 flex flex-col gap-2">
                        {profile ? (
                            <>
                                {profile.role === "user" && (
                                    <>
                                        <Link href={`/${locale}/bookings`} onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                                            <CalendarDays className="h-4 w-4" />
                                            {t("bookings")}
                                        </Link>
                                    </>
                                )}
                                <Link href={`/${locale}/account/settings`} onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                                    <Settings className="h-4 w-4" />
                                    {t("settings")}
                                </Link>
                                <button
                                    onClick={() => { handleLogout(); setMenuOpen(false); }}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600"
                                >
                                    <LogOut className="h-4 w-4" />
                                    {t("logout")}
                                </button>
                            </>
                        ) : (
                            <>
                                <Link href={`/${locale}/login`} onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100">
                                    {t("login")}
                                </Link>
                                <Link href={`/${locale}/register`} onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm text-center font-medium hover:bg-emerald-700">
                                    {t("register")}
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            )}
        </header>
    );
}
