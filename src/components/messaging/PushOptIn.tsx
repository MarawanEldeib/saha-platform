"use client";

import * as React from "react";
import { Bell, BellOff } from "lucide-react";
import { subscribeWebPushAction, unsubscribeWebPushAction } from "@/app/[locale]/messages/push-actions";

/**
 * SAH-96 PR C: opt-in toggle for web push notifications.
 *
 * Browser support note: requires Notification API + Service Worker +
 * PushManager. iOS Safari needs the user to "Add to Home Screen" first
 * (the API isn't exposed in tabbed browsing). We surface a friendly hint
 * for that case rather than silently hiding the toggle.
 */
export function PushOptIn() {
    const [supported, setSupported] = React.useState<"yes" | "no" | "ios-safari" | "loading">("loading");
    const [enabled, setEnabled] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        (async () => {
            if (typeof window === "undefined") return;
            // iOS Safari standalone-only check.
            const isIosSafari =
                /iP(hone|ad|od)/.test(navigator.userAgent) &&
                /^((?!crios|fxios|edgios).)*safari/i.test(navigator.userAgent);
            const isStandalone =
                "standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone;

            if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
                setSupported(isIosSafari && !isStandalone ? "ios-safari" : "no");
                return;
            }
            setSupported("yes");

            // Check existing subscription.
            try {
                const reg = await navigator.serviceWorker.getRegistration();
                if (!reg) {
                    setEnabled(false);
                    return;
                }
                const sub = await reg.pushManager.getSubscription();
                setEnabled(!!sub);
            } catch {
                setEnabled(false);
            }
        })();
    }, []);

    async function turnOn() {
        setBusy(true);
        setError(null);
        try {
            const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
            if (!publicKey) {
                setError("Push notifications aren't configured on this server.");
                return;
            }

            // Permission first.
            const perm = await Notification.requestPermission();
            if (perm !== "granted") {
                setError(
                    perm === "denied"
                        ? "You blocked notifications. Allow them in your browser settings to re-enable."
                        : "Notification permission was not granted.",
                );
                return;
            }

            // Register the worker.
            const reg =
                (await navigator.serviceWorker.getRegistration()) ??
                (await navigator.serviceWorker.register("/sw.js"));
            await navigator.serviceWorker.ready;

            // Subscribe via Push API.
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                // Cast: TS 5 narrows Uint8Array's buffer to ArrayBufferLike, but
                // the Push API expects ArrayBuffer specifically. Runtime is fine.
                applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
            });
            const json = sub.toJSON();
            const result = await subscribeWebPushAction({
                endpoint: json.endpoint!,
                p256dh: json.keys?.p256dh ?? "",
                auth: json.keys?.auth ?? "",
                userAgent: navigator.userAgent,
            });
            if (!result.ok) {
                setError(result.error ?? "Could not save subscription.");
                return;
            }
            setEnabled(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not enable notifications.");
        } finally {
            setBusy(false);
        }
    }

    async function turnOff() {
        setBusy(true);
        setError(null);
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            const sub = reg ? await reg.pushManager.getSubscription() : null;
            if (sub) {
                const endpoint = sub.endpoint;
                await sub.unsubscribe();
                await unsubscribeWebPushAction(endpoint);
            }
            setEnabled(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not disable notifications.");
        } finally {
            setBusy(false);
        }
    }

    if (supported === "loading") return null;
    if (supported === "no") return null;

    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3">
            <div className="shrink-0 w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                {enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {enabled ? "Notifications on" : "Get notified about new messages"}
                </p>
                {supported === "ios-safari" ? (
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                        On iOS, add Saha to your Home Screen first to enable notifications.
                    </p>
                ) : enabled ? (
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                        Saha will ping you when someone sends you a message.
                    </p>
                ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                        Allow browser notifications so you don&apos;t miss replies to your matchmaking posts.
                    </p>
                )}
                {error && <p className="text-xs text-red-500 mt-1" role="alert">{error}</p>}
            </div>
            {supported !== "ios-safari" && (
                <button
                    type="button"
                    onClick={() => (enabled ? void turnOff() : void turnOn())}
                    disabled={busy}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                        enabled
                            ? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                            : "bg-emerald-600 text-white hover:bg-emerald-700"
                    }`}
                >
                    {busy ? "…" : enabled ? "Turn off" : "Enable"}
                </button>
            )}
        </div>
    );
}

// Helper — VAPID public key is base64url-encoded; convert to the Uint8Array
// the browser's PushManager.subscribe() expects.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}
