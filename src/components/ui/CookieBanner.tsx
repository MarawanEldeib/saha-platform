"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "./Button";

const COOKIE_KEY = "saha_cookie_consent";

export function CookieBanner() {
    const t = useTranslations("common.cookie_banner");
    const [visible, setVisible] = React.useState(false);

    React.useEffect(() => {
        if (!localStorage.getItem(COOKIE_KEY)) {
            setVisible(true);
        }
    }, []);

    const accept = () => {
        localStorage.setItem(COOKIE_KEY, "accepted");
        setVisible(false);
    };

    const reject = () => {
        localStorage.setItem(COOKIE_KEY, "rejected");
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <div
            role="dialog"
            aria-live="polite"
            aria-label="Cookie consent"
            className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-xl"
        >
            <div className="max-w-7xl mx-auto px-4 py-4 sm:flex sm:items-center sm:justify-between gap-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">{t("message")}</p>
                <div className="flex gap-3 mt-3 sm:mt-0 shrink-0">
                    <Button variant="outline" size="sm" onClick={reject}>
                        {t("reject")}
                    </Button>
                    <Button variant="primary" size="sm" onClick={accept}>
                        {t("accept")}
                    </Button>
                </div>
            </div>
        </div>
    );
}
