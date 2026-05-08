"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";

export function ExportButton() {
    const t = useTranslations("dashboard.bookings");
    const [loading, setLoading] = useState(false);

    async function handleExport() {
        setLoading(true);
        try {
            const res = await fetch("/api/bookings/export");
            if (!res.ok) throw new Error("Export failed");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setLoading(false);
        }
    }

    return (
        <button
            onClick={handleExport}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
            <Download className="h-4 w-4" />
            {loading ? "…" : t("export_csv")}
        </button>
    );
}
