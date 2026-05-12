"use client";

import React from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { FAQ_CATEGORIES } from "./faq-data";

// SAH-153: Client-side search + accordion for the FAQ. Hydrates with the
// full list (server-rendered) and filters in-memory. No backend.

type FaqEntry = { category: string; key: string; q: string; a: string };

export function HelpAccordion() {
    const t = useTranslations("help");
    const tFaq = useTranslations("help.faq");
    const [query, setQuery] = React.useState("");
    const [openId, setOpenId] = React.useState<string | null>(null);

    // Flatten all entries once. useTranslations gives us t-functions that
    // resolve at render time, so collecting the actual q/a here keeps the
    // filter logic simple + localized.
    const entries = React.useMemo<FaqEntry[]>(() => {
        const flat: FaqEntry[] = [];
        for (const cat of FAQ_CATEGORIES) {
            for (const key of cat.keys) {
                flat.push({
                    category: cat.slug,
                    key,
                    q: tFaq(`${cat.slug}.${key}.q`),
                    a: tFaq(`${cat.slug}.${key}.a`),
                });
            }
        }
        return flat;
        // tFaq is stable across renders (next-intl memoizes), so empty deps are fine.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const normalized = query.trim().toLowerCase();
    const filtered = normalized.length === 0
        ? entries
        : entries.filter((e) =>
            e.q.toLowerCase().includes(normalized) || e.a.toLowerCase().includes(normalized),
        );

    // Group filtered entries by category so the search-narrowed view still
    // keeps the original categorical organization.
    const byCategory = new Map<string, FaqEntry[]>();
    for (const cat of FAQ_CATEGORIES) byCategory.set(cat.slug, []);
    for (const entry of filtered) byCategory.get(entry.category)?.push(entry);

    return (
        <>
            <div className="relative mb-8">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("search_placeholder")}
                    aria-label={t("search_placeholder")}
                    className="w-full ps-9 pe-9 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {query.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setQuery("")}
                        aria-label="Clear"
                        className="absolute end-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                        <X className="h-3.5 w-3.5 text-gray-500" />
                    </button>
                )}
            </div>

            {filtered.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-12">
                    {t("no_results")}
                </p>
            ) : (
                <div className="space-y-10">
                    {FAQ_CATEGORIES.map((cat) => {
                        const items = byCategory.get(cat.slug) ?? [];
                        if (items.length === 0) return null;
                        return (
                            <section key={cat.slug}>
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                                    {t(`category_${cat.slug}`)}
                                </h2>
                                <div className="space-y-2">
                                    {items.map((entry) => {
                                        const id = `${entry.category}-${entry.key}`;
                                        const isOpen = openId === id;
                                        return (
                                            <div
                                                key={id}
                                                className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => setOpenId(isOpen ? null : id)}
                                                    aria-expanded={isOpen}
                                                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-start text-sm font-medium text-gray-900 dark:text-white"
                                                >
                                                    <span className="flex-1">{entry.q}</span>
                                                    <ChevronDown
                                                        className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                                    />
                                                </button>
                                                {isOpen && (
                                                    <div className="px-4 pb-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                                                        {entry.a}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        );
                    })}
                </div>
            )}
        </>
    );
}
