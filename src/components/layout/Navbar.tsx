"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { MapPin, Menu, X, Globe, LogOut, LayoutDashboard, ShieldCheck } from "lucide-react";
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

    const otherLocale = locale === "en" ? "de" : "en";
    const switchLocalePath = pathname.replace(`/${locale}`, `/${otherLocale}`);

    const navLinks = [
        { href: `/${locale}/map`, label: t("map") },
        { href: `/${locale}/community`, label: t("community") },
        { href: `/${locale}/events`, label: t("events") },
    ];

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
                    <div className="hidden md:flex items-center gap-2">
                        {/* Language switcher */}
                        <Link
                            href={switchLocalePath}
                            className={ghostBtn}
                            aria-label={t("language")}
                        >
                            <Globe className="h-4 w-4" />
                            {otherLocale.toUpperCase()}
                        </Link>

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
                        <Link
                            href={switchLocalePath}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300"
                        >
                            <Globe className="h-4 w-4" />
                            {otherLocale === "en" ? "English" : "Deutsch"}
                        </Link>
                        {profile ? (
                            <button
                                onClick={() => { handleLogout(); setMenuOpen(false); }}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600"
                            >
                                <LogOut className="h-4 w-4" />
                                {t("logout")}
                            </button>
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
