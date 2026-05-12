/**
 * SAH-152 Phase 2: /matches/[id] match detail.
 *
 * Server-rendered. Shows the match metadata, participant strip, and the
 * host's cancel button OR the joined player's leave button OR — for a
 * stranger — a "join" CTA that posts to joinMatchAction. Chat thread + the
 * request/invite approval queues land in Phase 3 / 4.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { format } from "date-fns";
import { ar as arLocale } from "date-fns/locale";
import { MapPin, Clock, Users, ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { JoinLeaveControls } from "./JoinLeaveControls";

export const metadata = { title: "Match — Saha" };

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
}

interface MatchDetail {
    id: string;
    title: string;
    scheduled_for: string;
    status: "open" | "live" | "completed" | "cancelled";
    gate: "open" | "request" | "invite_only";
    format: string;
    capacity: number;
    skill_level: string;
    location_text: string | null;
    user_id: string;
    sports: { name: string } | null;
    profiles: { display_name: string | null; avatar_url: string | null } | null;
}

interface ParticipantRow {
    user_id: string;
    role: "host" | "player";
    joined_at: string;
    profiles: { display_name: string | null; avatar_url: string | null } | null;
}

const SPORT_EMOJI: Record<string, string> = {
    Padel: "🏓",
    Tennis: "🎾",
    Squash: "🥎",
    Badminton: "🏸",
    Pickleball: "🥒",
};

function Avatar({ url, name, size = "md" }: { url: string | null; name: string; size?: "sm" | "md" }) {
    const sizeClass = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
    const initial = (name?.trim()[0] ?? "?").toUpperCase();
    if (url) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className={`${sizeClass} rounded-full object-cover bg-gray-200`} />
        );
    }
    return (
        <div className={`${sizeClass} rounded-full flex items-center justify-center font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-200`}>
            {initial}
        </div>
    );
}

export default async function MatchDetailPage({ params }: PageProps) {
    const { locale, id } = await params;
    const t = await getTranslations("match_detail");
    const tCommon = await getTranslations("matches");
    const tSports = await getTranslations("sports");
    const supabase = await createClient();

    const matchResult = await supabase
        .from("matchmaking_posts")
        .select(`
            id, title, scheduled_for, status, gate, format, capacity,
            skill_level, location_text, user_id,
            sports(name),
            profiles!matchmaking_posts_user_id_fkey(display_name, avatar_url)
        `)
        .eq("id", id)
        .single();

    if (!matchResult.data) notFound();
    const match = matchResult.data as unknown as MatchDetail;

    const partsResult = await supabase
        .from("match_participants")
        .select(`
            user_id, role, joined_at,
            profiles!match_participants_user_id_fkey(display_name, avatar_url)
        `)
        .eq("match_id", id)
        .order("joined_at", { ascending: true });

    const participants = (partsResult.data ?? []) as unknown as ParticipantRow[];
    const joinedCount = participants.length;

    const { data: { user } } = await supabase.auth.getUser();
    const viewerId = user?.id ?? null;
    const isHost = viewerId === match.user_id;
    const isParticipant = viewerId
        ? participants.some((p) => p.user_id === viewerId)
        : false;

    const scheduledAt = new Date(match.scheduled_for);
    const dateLocale = locale === "ar" ? arLocale : undefined;
    const sportEmoji = SPORT_EMOJI[match.sports?.name ?? ""] ?? "🏟️";
    const knownSports = ["Padel", "Pickleball", "Tennis", "Squash", "Badminton"] as const;
    const sportLabel = match.sports?.name && knownSports.includes(match.sports.name as typeof knownSports[number])
        ? tSports(match.sports.name as typeof knownSports[number])
        : (match.sports?.name ?? tCommon("sport_unspecified"));
    const skillKey = ["beginner", "intermediate", "advanced", "competitive"].includes(match.skill_level)
        ? match.skill_level
        : "beginner";

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Link
                href={`/${locale}/matches`}
                className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-emerald-600 mb-4"
            >
                <ChevronLeft className="h-4 w-4" />
                {t("back")}
            </Link>

            <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6 mb-4">
                <div className="flex items-start gap-4 mb-4">
                    <div className="h-14 w-14 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-3xl shrink-0">
                        {sportEmoji}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                            {match.title}
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {t("hosted_by")} <span className="text-gray-700 dark:text-gray-300 font-medium">
                                {match.profiles?.display_name ?? t("anonymous_host")}
                            </span>
                        </p>
                    </div>
                    {match.status !== "open" && (
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            match.status === "cancelled" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" :
                            match.status === "completed" ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" :
                            "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                        }`}>
                            {t(`status.${match.status}`)}
                        </span>
                    )}
                </div>

                <dl className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                        <dt className="text-xs text-gray-500 dark:text-gray-500 mb-1 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {t("when")}
                        </dt>
                        <dd className="font-medium text-gray-900 dark:text-white">
                            {format(scheduledAt, "EEE, MMM d · h:mm a", { locale: dateLocale })}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs text-gray-500 dark:text-gray-500 mb-1 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {t("where")}
                        </dt>
                        <dd className="font-medium text-gray-900 dark:text-white truncate">
                            {match.location_text || sportLabel}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs text-gray-500 dark:text-gray-500 mb-1">{t("sport")}</dt>
                        <dd className="font-medium text-gray-900 dark:text-white">{sportLabel}</dd>
                    </div>
                    <div>
                        <dt className="text-xs text-gray-500 dark:text-gray-500 mb-1">{t("skill_format")}</dt>
                        <dd className="font-medium text-gray-900 dark:text-white">
                            {tCommon(`skill.${skillKey}` as `skill.${"beginner" | "intermediate" | "advanced" | "competitive"}`)}
                            {" · "}
                            {match.format === "casual" ? tCommon("format_casual") : match.format}
                        </dd>
                    </div>
                </dl>

                <div className="flex items-center justify-between mb-4 text-xs">
                    <span className="text-gray-500 dark:text-gray-500">
                        {t("gate_label")}: <span className="font-medium text-gray-700 dark:text-gray-300">
                            {t(`gate.${match.gate}`)}
                        </span>
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                        {joinedCount}/{match.capacity}
                    </span>
                </div>

                {/* Join / Leave / Cancel */}
                <JoinLeaveControls
                    matchId={match.id}
                    matchStatus={match.status}
                    matchGate={match.gate}
                    isHost={isHost}
                    isParticipant={isParticipant}
                    isAuthenticated={Boolean(viewerId)}
                    locale={locale}
                    isFull={joinedCount >= match.capacity}
                />
            </div>

            {/* Participants */}
            <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {t("participants_heading", { count: joinedCount })}
                </h2>
                {participants.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("no_participants")}</p>
                ) : (
                    <ul className="space-y-3">
                        {participants.map((p) => {
                            const isThisHost = p.user_id === match.user_id;
                            return (
                                <li key={p.user_id} className="flex items-center gap-3">
                                    <Avatar
                                        url={p.profiles?.avatar_url ?? null}
                                        name={p.profiles?.display_name ?? "Player"}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <Link
                                            href={`/${locale}/players/${p.user_id}`}
                                            className="text-sm font-medium text-gray-900 dark:text-white hover:text-emerald-600"
                                        >
                                            {p.profiles?.display_name ?? t("anonymous_player")}
                                        </Link>
                                        {isThisHost && (
                                            <span className="ml-2 text-[10px] uppercase font-semibold text-emerald-600 dark:text-emerald-400">
                                                {t("host_chip")}
                                            </span>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <p className="mt-6 text-xs text-gray-500 dark:text-gray-500 text-center">
                {t("phase_note")}
            </p>
        </div>
    );
}
