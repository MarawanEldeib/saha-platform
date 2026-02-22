import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { MapPin, Github, Mail } from "lucide-react";

export function Footer() {
    const t = useTranslations("nav");
    const locale = useLocale();

    const year = new Date().getFullYear();

    return (
        <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    {/* Brand */}
                    <div className="md:col-span-1">
                        <Link href={`/${locale}`} className="flex items-center gap-2 font-bold text-lg text-emerald-600 dark:text-emerald-400">
                            <MapPin className="h-5 w-5" />
                            Saha
                        </Link>
                        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                            The sports facility directory for students in Stuttgart and Baden-Württemberg.
                        </p>
                    </div>

                    {/* Explore */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Explore</h3>
                        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                            <li><Link href={`/${locale}/map`} className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">{t("map")}</Link></li>
                            <li><Link href={`/${locale}/community`} className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">{t("community")}</Link></li>
                            <li><Link href={`/${locale}/events`} className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">{t("events")}</Link></li>
                        </ul>
                    </div>

                    {/* Business */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Business</h3>
                        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                            <li><Link href={`/${locale}/register`} className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">List Your Facility</Link></li>
                            <li><Link href={`/${locale}/dashboard`} className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Business Dashboard</Link></li>
                        </ul>
                    </div>

                    {/* Legal */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Legal</h3>
                        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                            <li><Link href={`/${locale}/privacy`} className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Privacy Policy</Link></li>
                            <li><Link href={`/${locale}/terms`} className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Terms of Service</Link></li>
                            <li><Link href={`/${locale}/imprint`} className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Impressum</Link></li>
                        </ul>
                    </div>
                </div>

                <div className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500 dark:text-gray-500">
                    <p>© {year} Saha Platform. All rights reserved.</p>
                    <div className="flex items-center gap-4">
                        <a href="mailto:hello@saha.app" className="flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                            <Mail className="h-3.5 w-3.5" />
                            Contact
                        </a>
                        <a href="https://github.com" target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                            <Github className="h-3.5 w-3.5" />
                            GitHub
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
