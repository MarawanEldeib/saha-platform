import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { Mail, MessageCircle } from "lucide-react";
import { HelpAccordion } from "./HelpAccordion";

export const metadata: Metadata = { title: "Help Center – Saha" };

// SAH-153: static FAQ. Categories + entries are defined in faq-data.ts;
// translations live under help.faq.<category>.<key>.{q,a} in
// messages/{locale}.json. Search + accordion run client-side.

export default async function HelpPage() {
    const t = await getTranslations("help");

    return (
        <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                    {t("title")}
                </h1>
                <p className="text-gray-600 dark:text-gray-400">{t("subtitle")}</p>
            </header>

            <HelpAccordion />

            <section className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {t("contact_title")}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {t("contact_body")}
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                    <a
                        href="mailto:hello@saha.ae"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                        <Mail className="h-4 w-4" />
                        {t("contact_email")}
                    </a>
                    <a
                        href="https://wa.me/971501234567"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        <MessageCircle className="h-4 w-4" />
                        {t("contact_whatsapp")}
                    </a>
                </div>
            </section>
        </div>
    );
}
