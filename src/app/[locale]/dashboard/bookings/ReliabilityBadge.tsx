import { ShieldAlert, Shield, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

type Props = {
    score: number;       // 0..1
    noShows: number;
    total: number;
};

export async function ReliabilityBadge({ score, noShows, total }: Props) {
    const t = await getTranslations("reliability");
    // Brand-new players (no completed history) → don't render anything,
    // owners shouldn't pre-judge first-time bookers.
    if (total === 0) return null;
    // Players with zero no-shows and a clean record → silent good signal.
    if (noShows === 0) return null;

    const pct = Math.round(score * 100);
    let tone: "danger" | "warn" | "neutral";
    let Icon: typeof ShieldAlert;
    if (score < 0.8) {
        tone = "danger";
        Icon = ShieldAlert;
    } else if (score < 0.95) {
        tone = "warn";
        Icon = Shield;
    } else {
        tone = "neutral";
        Icon = ShieldCheck;
    }

    const tooltip = t("tooltip", { pct, noShows, total });
    return (
        <span
            title={tooltip}
            className={
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ms-2 align-middle " +
                (tone === "danger"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    : tone === "warn"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400")
            }
        >
            <Icon className="h-3 w-3" />
            {pct}%
        </span>
    );
}
