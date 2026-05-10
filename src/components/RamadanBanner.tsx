import { getTranslations } from "next-intl/server";
import { Moon } from "lucide-react";
import { getRamadanTimingsForToday } from "@/lib/ramadan";

export async function RamadanBanner() {
    const timings = await getRamadanTimingsForToday();
    if (!timings) return null;

    const t = await getTranslations("ramadan_banner");

    return (
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 dark:border-amber-900/40 dark:from-amber-950/20 dark:to-orange-950/20 px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-amber-900 dark:text-amber-200">
            <span className="inline-flex items-center gap-2 font-semibold">
                <Moon className="h-4 w-4" />
                {t("greeting")}
            </span>
            <span>
                <span className="font-medium">{t("suhoor")}:</span> {timings.suhoor}
            </span>
            <span>
                <span className="font-medium">{t("iftar")}:</span> {timings.iftar}
            </span>
            <span className="text-xs text-amber-700/80 dark:text-amber-300/70">{t("dubai_note")}</span>
        </div>
    );
}
