"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "./Button";

// SAH-122: cookie consent for non-essential analytics. We persist the
// choice in a real cookie (not localStorage) so the server-side root
// layout can decide whether to mount <Analytics />. After a choice we
// reload so the server picks up the new state immediately. Strictly
// necessary cookies (Supabase auth, facility-switcher) don't pass
// through here — only `_vercel_analytics` is gated.
const COOKIE_NAME = "saha_cookie_consent";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 12 months

function readConsent(): "accepted" | "rejected" | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
    if (!match) return null;
    const value = decodeURIComponent(match[1]);
    return value === "accepted" || value === "rejected" ? value : null;
}

function writeConsent(value: "accepted" | "rejected") {
    const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE_NAME}=${value}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
}

export function CookieBanner() {
    const t = useTranslations("common.cookie_banner");
    const [visible, setVisible] = React.useState(false);

    React.useEffect(() => {
        if (!readConsent()) setVisible(true);
    }, []);

    const choose = (value: "accepted" | "rejected") => {
        writeConsent(value);
        // Reload so the server-side layout re-reads the cookie and mounts
        // (or skips) <Analytics /> accordingly. Without this the choice
        // only kicks in on the next page navigation.
        window.location.reload();
    };

    if (!visible) return null;

    return (
        <div
            role="dialog"
            aria-live="polite"
            aria-label="Cookie consent"
            className="fixed bottom-0 inset-x-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-xl"
        >
            <div className="max-w-7xl mx-auto px-4 py-4 sm:flex sm:items-center sm:justify-between gap-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">{t("message")}</p>
                <div className="flex gap-3 mt-3 sm:mt-0 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => choose("rejected")}>
                        {t("reject")}
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => choose("accepted")}>
                        {t("accept")}
                    </Button>
                </div>
            </div>
        </div>
    );
}
