"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * SAH-126 Stage B: download a server-rendered PDF booking report.
 *
 * Pops a small inline date-range picker, hits `/api/bookings/report?from=…&to=…`,
 * streams the response as a download. No client-side PDF generation —
 * server uses @react-pdf/renderer so the design lives in one place.
 *
 * Defaults to the last 30 days; the user can override before downloading.
 */
export function PdfReportButton() {
    const t = useTranslations("dashboard.bookings");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const todayIso = new Date().toISOString().slice(0, 10);
    const monthAgoIso = (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().slice(0, 10);
    })();
    const [from, setFrom] = useState(monthAgoIso);
    const [to, setTo] = useState(todayIso);

    const download = async () => {
        setLoading(true);
        try {
            const qs = new URLSearchParams({ from, to });
            const res = await fetch(`/api/bookings/report?${qs}`);
            if (!res.ok) throw new Error(`Report failed (${res.status})`);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `saha-booking-report-${from}-to-${to}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
            setOpen(false);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative">
            <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
                <FileText className="h-4 w-4" />
                {t("download_report")}
            </button>
            {open && (
                <div className="absolute end-0 mt-2 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-4 z-20">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t("report_pick_range")}</p>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t("report_from")}</label>
                    <input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        max={to}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm mb-3"
                    />
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t("report_to")}</label>
                    <input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        min={from}
                        max={todayIso}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm mb-3"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={download}
                            disabled={loading}
                            className="flex-1 bg-emerald-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-60"
                        >
                            {loading ? t("report_generating") : t("report_download")}
                        </button>
                        <button
                            onClick={() => setOpen(false)}
                            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            {t("report_cancel")}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
