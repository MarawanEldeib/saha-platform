"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";

interface Props {
    /** Where to land the user after callback. Defaults to the locale root. */
    next?: string;
    /** Override label (defaults to "Continue with Google"). */
    label?: string;
}

/**
 * SAH-115: Google OAuth button used on /login and /register.
 * Calls Supabase Auth's PKCE flow; the response goes to /[locale]/auth/callback
 * which exchanges the code for a session and syncs profile metadata.
 */
export function GoogleSignInButton({ next, label = "Continue with Google" }: Props) {
    const locale = useLocale();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleClick = async () => {
        setError(null);
        setLoading(true);
        const supabase = createClient();
        const origin = window.location.origin;
        const redirectTo = `${origin}/${locale}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;

        const { error: oauthError } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo,
                queryParams: { prompt: "select_account" },
            },
        });

        if (oauthError) {
            setError(oauthError.message);
            setLoading(false);
        }
        // On success the browser is redirected to Google — no need to reset loading.
    };

    return (
        <div>
            <button
                type="button"
                onClick={handleClick}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
                <GoogleLogo className="h-4 w-4" />
                {loading ? "Redirecting…" : label}
            </button>
            {error && (
                <p className="mt-2 text-xs text-red-500 text-center" role="alert">{error}</p>
            )}
        </div>
    );
}

function GoogleLogo({ className }: { className?: string }) {
    // Official Google "G" mark, four-colour, simplified for inline rendering.
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
            <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.55-.21-2.27H12v4.51h6.46a5.49 5.49 0 0 1-2.4 3.61v3h3.88c2.27-2.09 3.55-5.16 3.55-8.85z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.08.72-2.45 1.16-4.06 1.16-3.12 0-5.77-2.1-6.71-4.94H1.27v3.1A12 12 0 0 0 12 24z"/>
            <path fill="#FBBC04" d="M5.29 14.31a7.2 7.2 0 0 1 0-4.62v-3.1H1.27a12 12 0 0 0 0 10.82l4.02-3.1z"/>
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.36.61 4.6 1.8l3.45-3.45A12 12 0 0 0 12 0 12 12 0 0 0 1.27 6.59l4.02 3.1C6.23 6.85 8.88 4.75 12 4.75z"/>
        </svg>
    );
}

export function OrDivider({ label = "OR" }: { label?: string }) {
    return (
        <div className="relative my-5">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-gray-200 dark:border-gray-800" />
            </div>
            <div className="relative flex justify-center">
                <span className="px-2 text-xs uppercase tracking-wider bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400">
                    {label}
                </span>
            </div>
        </div>
    );
}
