"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Check, Share2, QrCode, Download } from "lucide-react";
import QRCodeLib from "qrcode";

interface Props {
    slug: string;
    locale: string;
}

export function ShareableLinkCard({ slug, locale }: Props) {
    const [copied, setCopied] = useState(false);
    const [qrOpen, setQrOpen] = useState(false);
    const [qrSvg, setQrSvg] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/${locale}/f/${slug}`;

    useEffect(() => {
        if (!qrOpen || qrSvg) return;
        QRCodeLib.toString(url, {
            type: "svg",
            errorCorrectionLevel: "M",
            margin: 1,
            color: { dark: "#0f172a", light: "#ffffff" },
        }).then((svg) => setQrSvg(svg)).catch(() => setQrSvg(null));
    }, [qrOpen, qrSvg, url]);

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

    const handleDownloadPng = async () => {
        if (!canvasRef.current) return;
        try {
            await QRCodeLib.toCanvas(canvasRef.current, url, {
                width: 1024,
                errorCorrectionLevel: "M",
                margin: 2,
                color: { dark: "#0f172a", light: "#ffffff" },
            });
            const dataUrl = canvasRef.current.toDataURL("image/png");
            const a = document.createElement("a");
            a.href = dataUrl;
            a.download = `${slug}-qr.png`;
            a.click();
        } catch {
            /* render failure — leave the toggle as-is */
        }
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
                <div className="flex gap-2 flex-wrap">
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
                        onClick={() => setQrOpen((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                        <QrCode className="h-4 w-4" />
                        {qrOpen ? "Hide QR" : "Show QR"}
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

            {qrOpen && (
                <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center gap-4">
                    {/* React forbids dangerouslySetInnerHTML + children on the
                        same element — render two separate branches. */}
                    {qrSvg ? (
                        <div
                            className="bg-white p-2 rounded-lg border border-gray-200 dark:border-gray-700 w-48 h-48 flex items-center justify-center"
                            // eslint-disable-next-line react/no-danger
                            dangerouslySetInnerHTML={{ __html: qrSvg }}
                        />
                    ) : (
                        <div className="bg-white p-2 rounded-lg border border-gray-200 dark:border-gray-700 w-48 h-48 flex items-center justify-center">
                            <span className="text-xs text-gray-400">Generating…</span>
                        </div>
                    )}
                    <div className="flex flex-col gap-2 items-start">
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                            Print this on flyers, table cards, or your reception desk. Players scan to land directly on your booking page.
                        </p>
                        <button
                            type="button"
                            onClick={handleDownloadPng}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            <Download className="h-4 w-4" />
                            Download PNG
                        </button>
                        <canvas ref={canvasRef} className="hidden" />
                    </div>
                </div>
            )}
        </section>
    );
}
