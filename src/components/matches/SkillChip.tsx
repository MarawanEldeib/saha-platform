/**
 * SAH-152 Phase 8: skill rating chip.
 *
 * Displays a numeric self-reported rating (1.00–7.00) next to a player's
 * name. Mirrors the `1.20` chip in the design mockup. Hidden when the
 * player hasn't rated themselves yet (rating === null).
 */

interface Props {
    rating: number | string | null | undefined;
    size?: "xs" | "sm";
}

function colorFor(rating: number): { bg: string; text: string } {
    // Buckets tuned to the padel ladder convention:
    //   1.0–2.5 beginner    → emerald
    //   2.5–4.0 intermediate → yellow
    //   4.0–5.5 advanced     → orange
    //   5.5–7.0 competitive  → red
    if (rating < 2.5) return { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300" };
    if (rating < 4.0) return { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-800 dark:text-yellow-300" };
    if (rating < 5.5) return { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300" };
    return { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300" };
}

export function SkillChip({ rating, size = "xs" }: Props) {
    if (rating === null || rating === undefined) return null;
    const num = typeof rating === "string" ? parseFloat(rating) : rating;
    if (!Number.isFinite(num)) return null;
    const { bg, text } = colorFor(num);
    const sizeClass = size === "xs"
        ? "text-[10px] px-1.5 py-0.5"
        : "text-xs px-2 py-0.5";
    return (
        <span className={`inline-flex items-center rounded-md font-semibold tabular-nums ${bg} ${text} ${sizeClass}`}>
            {num.toFixed(2)}
        </span>
    );
}
