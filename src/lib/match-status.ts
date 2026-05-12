/**
 * SAH-152 Phase 7: lifecycle helper. Translates the DB status + clock
 * into the display label used by the feed cards and the detail page.
 *
 * Rules:
 *   - `cancelled` always wins (host explicitly cancelled).
 *   - `completed` from the DB always wins (auto-complete cron stamped it).
 *   - If now is before `scheduled_for`              → "upcoming"
 *   - If now is between scheduled_for + duration     → "live"
 *   - If now is after  scheduled_for + duration      → "ended"
 *     (a yet-uncompleted match the cron hasn't swept; rendered as Completed)
 */

export type DisplayStatus = "upcoming" | "live" | "ended" | "completed" | "cancelled";

export function computeDisplayStatus(args: {
    scheduledForIso: string;
    durationMinutes: number;
    status: "open" | "live" | "completed" | "cancelled";
    now?: Date;
}): DisplayStatus {
    const { scheduledForIso, durationMinutes, status } = args;
    const now = args.now ?? new Date();
    if (status === "cancelled") return "cancelled";
    if (status === "completed") return "completed";

    const start = new Date(scheduledForIso).getTime();
    const end = start + Math.max(15, Math.min(480, durationMinutes)) * 60 * 1000;
    const t = now.getTime();
    if (t < start) return "upcoming";
    if (t <= end) return "live";
    return "ended";
}
