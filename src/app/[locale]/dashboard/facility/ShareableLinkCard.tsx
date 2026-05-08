"use client";

import { useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";

interface Props {
    slug: string;
    locale: string;
}

export function ShareableLinkCard({ slug, locale }: Props) {
    const [copied, setCopied] = useState(false);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/${locale}/f/${slug}`;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard API unavailable — leave button unchanged */
        }
    };

    const handleShareWhatsApp = () => {
        const text = encodeURIComponent(`Book a court here: ${url}`);
        window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
    };

    return (
        <section className="border border-gray-200 dark:border-gray-800 rounded-2xl p-5 bg-white dark:bg-gray-900 space-y-3">
            <div className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-emerald-500" />
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Your booking link</h2>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
                Share this on Instagram bio, WhatsApp, flyers — players land directly on your booking page.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
                <code className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 rounded-lg text-gray-900 dark:text-white break-all border border-gray-200 dark:border-gray-700">
                    {url || `/${locale}/f/${slug}`}
                </code>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        {copied ? "Copied" : "Copy"}
                    </button>
                    <button
                        type="button"
                        onClick={handleShareWhatsApp}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                        <Share2 className="h-4 w-4" />
                        WhatsApp
                    </button>
                </div>
            </div>
        </section>
    );
}
