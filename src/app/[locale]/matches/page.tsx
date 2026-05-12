/**
 * SAH-152 Phase 1: Matches feed (read-only).
 *
 * Cards-based view of open matches matching the design mockup — sport icon,
 * title, location, skill + format chips, scheduled time, fill progress with
 * adaptive copy, participant avatars, and a "Join Game" CTA. Posting still
 * happens via `/community` until Phase 2 ships `/matches/new`.
 *
 * Server-rendered; participant avatars come from a separate query because
 * `match_participants` isn't declared as a foreign-key relation in
 * `database.ts` yet (we keep the manual schema augment compact).
 */

import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { format, isToday, isTomorrow, isThisWeek } from "date-fns";
import { ar as arLocale } from "date-fns/locale";
import { MapPin, Clock, Users, Plus } from "lucide-react";
import { computeDisplayStatus } from "@/lib/match-status";

export const metadata = { title: "Matches — Saha" };

interface MatchRow {
    id: string;
    title: string;
    scheduled_for: string;
    status: "open" | "live" | "completed" | "cancelled";
    gate: string;
    format: string;
    capacity: number;
    duration_minutes: number;
    skill_level: string;
    location_text: string | null;
    sports: { name: string } | null;
}

interface ParticipantRow {
    match_id: string;
    user_id: string;
    role: string;
    profiles: { display_name: string | null; avatar_url: string | null } | null;
}

const SPORT_EMOJI: Record<string, string> = {
    Padel: "🏓",
    Tennis: "🎾",
    Squash: "🥎",
    Badminton: "🏸",
    Pickleball: "🥒",
};

const SKILL_ORDER = ["beginner", "intermediate", "advanced", "competitive"] as const;

function relativeDay(date: Date, locale: string, t: (k: string) => string): string {
    const dateLocale = locale === "ar" ? arLocale : undefined;
    if (isToday(date)) return t("relative.today");
    if (isTomorrow(date)) return t("relative.tomorrow");
    if (isThisWeek(date, { weekStartsOn: 1 })) return format(date, "EEEE", { locale: dateLocale });
    return format(date, "MMM d", { locale: dateLocale });
}

function timeOfDay(date: Date, locale: string): string {
    return format(date, "h:mm a", { locale: locale === "ar" ? arLocale : undefined });
}

function fillState(joined: number, capacity: number): "filling_fast" | "looking_for_players" | "need_opponent" {
    const ratio = capacity > 0 ? joined / capacity : 0;
    if (ratio >= 0.7) return "filling_fast";
    if (ratio >= 0.3) return "looking_for_players";
    return "need_opponent";
}

function fillBarColor(state: "filling_fast" | "looking_for_players" | "need_opponent"): string {
    if (state === "filling_fast") return "bg-orange-500";
    if (state === "looking_for_players") return "bg-yellow-500";
    return "bg-lime-500";
}

function Avatar({ url, name, size = "sm" }: { url: string | null; name: string; size?: "xs" | "sm" }) {
    const sizeClass = size === "xs" ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-xs";
    const initial = (name?.trim()[0] ?? "?").toUpperCase();
    if (url) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={url}
                alt=""
                className={`${sizeClass} rounded-full object-cover ring-2 ring-white dark:ring-gray-900 bg-gray-200`}
            />
        );
    }
    return (
        <div
            className={`${sizeClass} rounded-full flex items-center justify-center font-semibold text-emerald-700 bg-emerald-100 ring-2 ring-white dark:ring-gray-900 dark:bg-emerald-900/40 dark:text-emerald-200`}
        >
            {initial}
        </div>
    );
}

export default async function MatchesPage() {
    const t = await getTranslations("matches");
    const tSports = await getTranslations("sports");
    const locale = await getLocale();
    const supabase = await createClient();

    const now = new Date();
    // Max duration_minutes is 480 (8 h) — anything older than that hasn't
    // ended yet only in pathological cases; the auto-complete cron sweeps
    // them anyway. Fetch a wider window then trim to live/upcoming in JS.
    const earliestStartIso = new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString();

    const matchesResult = await supabase
        .from("matchmaking_posts")
        .select(`
            id, title, scheduled_for, status, gate, format, capacity, duration_minutes,
            skill_level, location_text,
            sports(name)
        `)
        .eq("status", "open")
        .gte("scheduled_for", earliestStartIso)
        .order("scheduled_for", { ascending: true })
        .limit(60);

    const matches = ((matchesResult.data ?? []) as unknown as MatchRow[]).filter((m) => {
        const display = computeDisplayStatus({
            scheduledForIso: m.scheduled_for,
            durationMinutes: m.duration_minutes ?? 60,
            status: m.status,
            now,
        });
        return display === "upcoming" || display === "live";
    });

    // Pull participants for every match in one query, then group client-side.
    const matchIds = matches.map((m) => m.id);
    const participantsByMatch = new Map<string, ParticipantRow[]>();
    if (matchIds.length > 0) {
        const partResult = await supabase
            .from("match_participants")
            .select(`
                match_id, user_id, role,
                profiles!match_participants_user_id_fkey(display_name, avatar_url)
            `)
            .in("match_id", matchIds);
        const partRows = (partResult.data ?? []) as unknown as ParticipantRow[];
        for (const row of partRows) {
            if (!participantsByMatch.has(row.match_id)) participantsByMatch.set(row.match_id, []);
            participantsByMatch.get(row.match_id)!.push(row);
        }
    }

    const knownSports = ["Padel", "Pickleball", "Tennis", "Squash", "Badminton"] as const;
    const sportName = (name: string | undefined) =>
        name && knownSports.includes(name as typeof knownSports[number])
            ? tSports(name as typeof knownSports[number])
            : (name ?? t("sport_unspecified"));

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                        {t("title")}
                    </h1>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{t("subtitle")}</p>
                </div>
                <Link
                    href={`/${locale}/matches/new`}
                    className="inline-flex items-center gap-1.5 self-start sm:self-auto px-5 py-2.5 rounded-xl font-semibold text-sm bg-lime-300 hover:bg-lime-400 text-gray-900 transition-colors shadow-sm"
                >
                    <Plus className="h-4 w-4" />
                    {t("post_a_game")}
                </Link>
            </div>

            {/* Cards grid */}
            {matches.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
                    <p className="text-gray-600 dark:text-gray-400">{t("empty")}</p>
                    <Link
                        href={`/${locale}/matches/new`}
                        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm"
                    >
                        <Plus className="h-4 w-4" /> {t("post_a_game")}
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {matches.map((m) => {
                        const participants = participantsByMatch.get(m.id) ?? [];
                        const joined = participants.length;
                        const state = fillState(joined, m.capacity);
                        const fillPct = m.capacity > 0 ? Math.min(100, (joined / m.capacity) * 100) : 0;
                        const scheduledAt = new Date(m.scheduled_for);
                        const sportEmoji = SPORT_EMOJI[m.sports?.name ?? ""] ?? "🏟️";
                        const skillKey = SKILL_ORDER.includes(m.skill_level as typeof SKILL_ORDER[number])
                            ? m.skill_level
                            : "beginner";
                        const visibleAvatars = participants.slice(0, 3);
                        const overflow = Math.max(0, joined - visibleAvatars.length);

                        const displayStatus = computeDisplayStatus({
                            scheduledForIso: m.scheduled_for,
                            durationMinutes: m.duration_minutes ?? 60,
                            status: m.status,
                            now,
                        });
                        const isLive = displayStatus === "live";

                        return (
                            <article
                                key={m.id}
                                className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5 shadow-sm hover:shadow-md transition-shadow"
                            >
                                <Link href={`/${locale}/matches/${m.id}`} className="block group">
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xl shrink-0">
                                                {sportEmoji}
                                            </div>
                                            <div className="min-w-0">
                                                <h2 className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-emerald-600">
                                                    {m.title}
                                                </h2>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                                                    <MapPin className="h-3 w-3 shrink-0" />
                                                    <span className="truncate">
                                                        {m.location_text ?? sportName(m.sports?.name)}
                                                    </span>
                                                </p>
                                            </div>
                                        </div>
                                        {isLive && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                                                {t("live")}
                                            </span>
                                        )}
                                    </div>
                                </Link>

                                <div className="flex items-center gap-2 text-xs mb-3">
                                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                                        {t(`skill.${skillKey}`)}
                                    </span>
                                    <span className="text-gray-300 dark:text-gray-700">·</span>
                                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                                        {m.format === "casual" ? t("format_casual") : m.format}
                                    </span>
                                </div>

                                <p className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1 mb-3">
                                    <Clock className="h-3 w-3" />
                                    <span>
                                        {relativeDay(scheduledAt, locale, t)}
                                        {", "}
                                        {timeOfDay(scheduledAt, locale)}
                                    </span>
                                </p>

                                <div className="mb-2">
                                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                        <div
                                            className={`h-full ${fillBarColor(state)} transition-all`}
                                            style={{ width: `${fillPct}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between text-xs mb-4">
                                    <span className="text-gray-600 dark:text-gray-400">
                                        {t(`fill.${state}`)}
                                    </span>
                                    <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
                                        {joined}/{m.capacity}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex -space-x-2">
                                        {visibleAvatars.map((p, i) => (
                                            <Avatar
                                                key={`${m.id}-${p.user_id}-${i}`}
                                                url={p.profiles?.avatar_url ?? null}
                                                name={p.profiles?.display_name ?? "Player"}
                                            />
                                        ))}
                                        {overflow > 0 && (
                                            <div className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 ring-2 ring-white dark:ring-gray-900">
                                                +{overflow}
                                            </div>
                                        )}
                                        {visibleAvatars.length === 0 && (
                                            <Users className="h-5 w-5 text-gray-400 dark:text-gray-600" />
                                        )}
                                    </div>
                                    <Link
                                        href={`/${locale}/matches/${m.id}`}
                                        className="px-4 py-1.5 rounded-lg border border-emerald-600 text-emerald-700 dark:text-emerald-400 dark:border-emerald-500 text-sm font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                    >
                                        {t("join_game")}
                                    </Link>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}

        </div>
    );
}
