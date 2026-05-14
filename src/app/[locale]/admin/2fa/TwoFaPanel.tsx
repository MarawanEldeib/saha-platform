"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, KeyRound, Clock } from "lucide-react";
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

// SAH-80 bounce-back: TOTP codes rotate every 30s. We surface a live
// countdown so the user knows roughly how long their current code is
// valid. Aligned to TOTP's RFC-6238 30-second window starting from the
// Unix epoch — the time-remaining is `30 - (epochSeconds % 30)`.
function getTotpSecondsRemaining(): number {
    return 30 - Math.floor(Date.now() / 1000) % 30;
}

export function TwoFaPanel({ mode: initialMode, factorId: existingFactorId, nextPath }: Props) {
    const router = useRouter();
    const [mode] = useState(initialMode);
    const [enroll, setEnroll] = useState<EnrollState | null>(null);
    const [code, setCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const [secondsLeft, setSecondsLeft] = useState(getTotpSecondsRemaining());
    const submittedRef = useRef(false);

    useEffect(() => {
        if (mode !== "enroll" || enroll) return;
        let cancelled = false;
        (async () => {
            const supabase = createClient();
            // SAH-80 hardening: enrol against a friendly name we control,
            // and clear any previously-unverified factors so re-enrolment
            // doesn't pile up "Admin · 2026-05-14" rows that the user
            // could accidentally pick on the verify step.
            const { data: existing } = await supabase.auth.mfa.listFactors();
            const stale = existing?.totp?.filter((f) => f.status !== "verified") ?? [];
            for (const f of stale) {
                await supabase.auth.mfa.unenroll({ factorId: f.id });
            }

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

    // SAH-80 bounce-back: live countdown so the user knows how much time
    // is left on their current TOTP code before it rotates.
    useEffect(() => {
        const tick = () => setSecondsLeft(getTotpSecondsRemaining());
        const t = window.setInterval(tick, 1000);
        return () => window.clearInterval(t);
    }, []);

    function submit(e?: React.FormEvent) {
        e?.preventDefault();
        if (code.length < 6) {
            setError("Enter the 6-digit code from your authenticator.");
            return;
        }
        setError(null);
        submittedRef.current = true;
        startTransition(async () => {
            const supabase = createClient();
            const factorIdToUse = mode === "enroll" ? enroll?.factorId : existingFactorId;
            if (!factorIdToUse) {
                setError("No factor to verify.");
                submittedRef.current = false;
                return;
            }
            const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
                factorId: factorIdToUse,
            });
            if (challengeError || !challenge) {
                setError(challengeError?.message ?? "Could not start challenge.");
                submittedRef.current = false;
                return;
            }
            const { error: verifyError } = await supabase.auth.mfa.verify({
                factorId: factorIdToUse,
                challengeId: challenge.id,
                code,
            });
            if (verifyError) {
                // SAH-80 bounce-back: Supabase returns the literal "Invalid
                // TOTP code entered" string when the code doesn't match.
                // Translate to actionable guidance — most common cause is
                // clock-skew on the user's device or the code rotating
                // before they submitted it. Clear the input so they can
                // try the next 30-second window cleanly.
                const verbatim = verifyError.message ?? "";
                const isInvalidCode = /invalid.*totp/i.test(verbatim) || /invalid.*code/i.test(verbatim);
                setError(
                    isInvalidCode
                        ? "That code didn't verify. The most common cause is that the 30-second window already rotated, or your phone's clock is out of sync. Wait for the next code and try again. If it still fails after several tries, enable automatic time-zone/date on your phone (Settings → General → Date & Time → Set Automatically)."
                        : verbatim || "Could not verify the code."
                );
                setCode("");
                submittedRef.current = false;
                return;
            }
            router.replace(nextPath);
            router.refresh();
        });
    }

    // SAH-80 bounce-back: auto-submit the moment 6 digits are entered.
    // Eliminates the common failure where the user types digits, fumbles
    // for the Submit button, and the code expires before they click.
    useEffect(() => {
        if (code.length === 6 && !pending && !submittedRef.current) {
            submit();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code, pending]);

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
                {/* SAH-80 bounce-back: live countdown for the current 30s window. */}
                <span className="mt-2 flex items-center justify-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Clock className="h-3 w-3" />
                    Current code rotates in {secondsLeft}s
                </span>
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
