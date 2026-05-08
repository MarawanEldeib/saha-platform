"use client";

import QRCode from "react-qr-code";
import { useState } from "react";
import { X, Maximize2 } from "lucide-react";

interface Props {
    token: string;
    appUrl: string;
}

export function BookingQRCode({ token, appUrl }: Props) {
    const [fullscreen, setFullscreen] = useState(false);
    const shareUrl = `${appUrl}/booking/${token}`;

    return (
        <>
            <button
                onClick={() => setFullscreen(true)}
                className="w-full flex flex-col items-center gap-2 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
            >
                <QRCode value={shareUrl} size={160} className="rounded" />
                <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <Maximize2 className="h-3 w-3" />
                    Tap to expand for scanning
                </span>
            </button>

            {fullscreen && (
                <div className="fixed inset-0 bg-white dark:bg-gray-950 z-50 flex flex-col items-center justify-center p-8 gap-6">
                    <button
                        onClick={() => setFullscreen(false)}
                        className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                    >
                        <X className="h-5 w-5" />
                    </button>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Show this at reception</p>
                    <QRCode value={shareUrl} size={280} className="rounded-lg" />
                    <p className="text-xs text-gray-400 dark:text-gray-600 font-mono break-all text-center max-w-xs">{token}</p>
                </div>
            )}
        </>
    );
}
