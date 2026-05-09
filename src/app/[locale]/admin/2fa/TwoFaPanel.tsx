"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Props = {
    mode: "enroll" | "challenge";
    factorId: string | null;
    nextPath: string;
};

interface EnrollState {
    factorId: string;
    qrCode: string;
    secret: string;
}

export function TwoFaPanel({ mode: initialMode, factorId: existingFactorId, nextPath }: Props) {
    const router = useRouter();
    const [mode, setMode] = useState(initialMode);
    const [enroll, setEnroll] = useState<EnrollState | null>(null);
    const [code, setCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    useEffect(() => {
        if (mode !== "enroll" || enroll) return;
        let cancelled = false;
        (async () => {
            const supabase = createClient();
            const { data, error: enrollError } = await supabase.auth.mfa.enroll({
                factorType: "totp",
                friendlyName: `Admin · ${new Date().toLocaleDateString()}`,
            });
            if (cancelled) return;
            if (enrollError || !data) {
                setError(enrollError?.message ?? "Could not start enrolment. Is TOTP enabled in Supabase Auth?");
                return;
            }
            setEnroll({
                factorId: data.id,
                qrCode: data.totp.qr_code,
                secret: data.totp.secret,
            });
        })();
        return () => { cancelled = true; };
    }, [mode, enroll]);

    function submit(e: React.FormEvent) {
        e.preventDefault();
        if (code.length < 6) {
            setError("Enter the 6-digit code from your authenticator.");
            return;
        }
        setError(null);
        startTransition(async () => {
            const supabase = createClient();
            const factorIdToUse = mode === "enroll" ? enroll?.factorId : existingFactorId;
            if (!factorIdToUse) {
                setError("No factor to verify.");
                return;
            }
            const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
                factorId: factorIdToUse,
            });
            if (challengeError || !challenge) {
                setError(challengeError?.message ?? "Could not start challenge.");
                return;
            }
            const { error: verifyError } = await supabase.auth.mfa.verify({
                factorId: factorIdToUse,
                challengeId: challenge.id,
                code,
            });
            if (verifyError) {
                setError(verifyError.message);
                return;
            }
            router.replace(nextPath);
            router.refresh();
        });
    }

    return (
        <form onSubmit={submit} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 space-y-5">
            {mode === "enroll" && (
                enroll ? (
                    <div className="space-y-3 text-center">
                        {/* qr_code is an SVG data URL — render directly. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={enroll.qrCode}
                            alt="TOTP QR code"
                            className="w-44 h-44 mx-auto bg-white p-2 rounded-lg"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Scan with your authenticator, then enter the code below.
                        </p>
                        <details className="text-xs text-gray-500 dark:text-gray-400">
                            <summary className="cursor-pointer">Can&apos;t scan? Show secret</summary>
                            <code className="block mt-2 font-mono break-all bg-gray-50 dark:bg-gray-800 p-2 rounded">{enroll.secret}</code>
                        </details>
                    </div>
                ) : (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                    </div>
                )
            )}

            <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5" />
                    6-digit code
                </span>
                <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-lg tabular-nums tracking-widest text-center"
                    placeholder="123456"
                />
            </label>

            {error && <p className="text-sm text-red-500" role="alert">{error}</p>}

            <button
                type="submit"
                disabled={pending || code.length < 6}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {pending ? "Verifying…" : "Verify"}
            </button>
        </form>
    );
}
