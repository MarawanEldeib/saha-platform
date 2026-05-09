"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, X, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { checkInByQrTokenAction } from "../actions";

type ScanResult = {
    kind: "ok" | "already";
    playerName: string;
    courtName: string;
    startTime: string;
    endTime: string;
    numPlayers: number;
};

function extractToken(scanned: string): string | null {
    // QR contents can be a full URL like .../booking/<uuid> or just the
    // raw token. Pull the last non-empty path segment when there's a URL.
    try {
        const url = new URL(scanned);
        const segments = url.pathname.split("/").filter(Boolean);
        return segments[segments.length - 1] ?? null;
    } catch {
        return scanned.trim();
    }
}

export function QrScannerModal() {
    const t = useTranslations("checkin_scanner");
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ScanResult | null>(null);
    const [pending, startTransition] = useTransition();
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const controlsRef = useRef<IScannerControls | null>(null);
    const lastScannedRef = useRef<string | null>(null);

    useEffect(() => {
        if (!open) return;
        // Skip the camera while we're showing a result so the player isn't
        // re-scanning the same QR in a tight loop.
        if (result) return;

        let cancelled = false;
        const reader = new BrowserMultiFormatReader();

        (async () => {
            try {
                if (!videoRef.current) return;
                const controls = await reader.decodeFromVideoDevice(
                    undefined,
                    videoRef.current,
                    (decoded) => {
                        if (cancelled || !decoded) return;
                        const text = decoded.getText();
                        if (lastScannedRef.current === text) return;
                        lastScannedRef.current = text;
                        const token = extractToken(text);
                        if (!token) {
                            setError(t("invalid"));
                            return;
                        }
                        startTransition(async () => {
                            const res = await checkInByQrTokenAction(token);
                            if ("error" in res && res.error) {
                                setError(res.error);
                                // Reset throttle so a fresh scan after the
                                // error message is allowed.
                                setTimeout(() => { lastScannedRef.current = null; }, 1500);
                                return;
                            }
                            if ("alreadyCheckedIn" in res && res.alreadyCheckedIn) {
                                setResult({ kind: "already", ...res.booking });
                                return;
                            }
                            if ("success" in res && res.success) {
                                setResult({ kind: "ok", ...res.booking });
                                router.refresh();
                            }
                        });
                    },
                );
                if (cancelled) {
                    controls.stop();
                    return;
                }
                controlsRef.current = controls;
            } catch {
                if (!cancelled) setError(t("camera_error"));
            }
        })();

        return () => {
            cancelled = true;
            controlsRef.current?.stop();
            controlsRef.current = null;
        };
    }, [open, result, router, t]);

    function reset() {
        setResult(null);
        setError(null);
        lastScannedRef.current = null;
    }

    function close() {
        controlsRef.current?.stop();
        controlsRef.current = null;
        setOpen(false);
        reset();
    }

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
                <Camera className="h-4 w-4" />
                {t("scan_button")}
            </button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
                    <h2 className="font-semibold text-gray-900 dark:text-white">{t("modal_heading")}</h2>
                    <button
                        type="button"
                        onClick={close}
                        className="p-1 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        aria-label={t("close")}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-4 space-y-3">
                    {result ? (
                        <div className="text-center py-4 space-y-3">
                            {result.kind === "ok" ? (
                                <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
                            ) : (
                                <AlertTriangle className="h-14 w-14 text-amber-500 mx-auto" />
                            )}
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                {result.kind === "ok" ? t("checked_in") : t("already_checked_in")}
                            </h3>
                            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                                <p className="font-medium">{result.playerName}</p>
                                <p>{result.courtName} · {result.startTime.slice(0, 5)}–{result.endTime.slice(0, 5)}</p>
                                <p>{t("num_players", { n: result.numPlayers })}</p>
                            </div>
                            <button
                                type="button"
                                onClick={reset}
                                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:opacity-90"
                            >
                                <Camera className="h-4 w-4" />
                                {t("scan_next")}
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="relative aspect-square bg-black rounded-xl overflow-hidden">
                                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                    <div className="w-2/3 h-2/3 border-2 border-white/70 rounded-2xl" />
                                </div>
                                {pending && (
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                        <Loader2 className="h-8 w-8 text-white animate-spin" />
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                                {t("instructions")}
                            </p>
                            {error && (
                                <p className="text-sm text-red-500 text-center" role="alert">{error}</p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
