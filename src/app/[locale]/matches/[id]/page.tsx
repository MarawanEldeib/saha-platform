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
import { computeDisplayStatus } from "@/lib/match-status";
import { JoinLeaveControls } from "./JoinLeaveControls";
import { MatchHostInvites } from "./MatchHostInvites";
import { MatchInviteResponse } from "./MatchInviteResponse";
import { MatchJoinRequests } from "./MatchJoinRequests";
import { MatchChat } from "./MatchChat";
import { SkillChip } from "@/components/matches/SkillChip";

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
    duration_minutes: number;
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
    profiles: {
        display_name: string | null;
        avatar_url: string | null;
        skill_rating: number | string | null;
    } | null;
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
            id, title, scheduled_for, status, gate, format, capacity, duration_minutes,
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
            profiles!match_participants_user_id_fkey(display_name, avatar_url, skill_rating)
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

    // Host-only: load contacts + groups + the invite roll-up.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let hostContacts: Array<{
        user_id: string;
        display_name: string | null;
        avatar_url: string | null;
        skill_rating: number | null;
    }> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let hostGroups: Array<{ id: string; name: string; member_count: number }> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let hostInvites: Array<{
        id: string; invitee_user_id: string;
        status: "pending" | "accepted" | "declined" | "expired" | "cancelled";
        display_name: string | null; avatar_url: string | null;
        skill_rating: number | null;
    }> = [];

    if (isHost && viewerId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: contactsData } = await (supabase as any)
            .from("player_contacts")
            .select(`
                contact_user_id,
                profiles!player_contacts_contact_user_id_fkey(display_name, avatar_url, skill_rating)
            `)
            .eq("owner_id", viewerId);

        hostContacts = ((contactsData ?? []) as Array<{
            contact_user_id: string;
            profiles: { display_name: string | null; avatar_url: string | null; skill_rating: number | string | null } | null;
        }>).map((c) => ({
            user_id: c.contact_user_id,
            display_name: c.profiles?.display_name ?? null,
            avatar_url: c.profiles?.avatar_url ?? null,
            skill_rating: c.profiles?.skill_rating != null ? Number(c.profiles.skill_rating) : null,
        }));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: groupsRaw } = await (supabase as any)
            .from("player_groups")
            .select("id, name")
            .eq("owner_id", viewerId)
            .order("created_at", { ascending: false });
        const grs = (groupsRaw ?? []) as Array<{ id: string; name: string }>;
        if (grs.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: memberCounts } = await (supabase as any)
                .from("player_group_members")
                .select("group_id")
                .in("group_id", grs.map((g) => g.id));
            const counts = new Map<string, number>();
            for (const m of (memberCounts ?? []) as Array<{ group_id: string }>) {
                counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1);
            }
            hostGroups = grs.map((g) => ({ id: g.id, name: g.name, member_count: counts.get(g.id) ?? 0 }));
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: invitesData } = await (supabase as any)
            .from("match_invites")
            .select(`
                id, invitee_user_id, status,
                profiles!match_invites_invitee_user_id_fkey(display_name, avatar_url, skill_rating)
            `)
            .eq("match_id", id)
            .order("sent_at", { ascending: false });

        hostInvites = ((invitesData ?? []) as Array<{
            id: string; invitee_user_id: string;
            status: "pending" | "accepted" | "declined" | "expired" | "cancelled";
            profiles: { display_name: string | null; avatar_url: string | null; skill_rating: number | string | null } | null;
        }>).map((i) => ({
            id: i.id,
            invitee_user_id: i.invitee_user_id,
            status: i.status,
            display_name: i.profiles?.display_name ?? null,
            avatar_url: i.profiles?.avatar_url ?? null,
            skill_rating: i.profiles?.skill_rating != null ? Number(i.profiles.skill_rating) : null,
        }));
    }

    // Invited-viewer flow: do I have a pending invite to this match?
    let viewerPendingInviteId: string | null = null;
    if (viewerId && !isHost && !isParticipant) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: myInvite } = await (supabase as any)
            .from("match_invites")
            .select("id, status")
            .eq("match_id", id)
            .eq("invitee_user_id", viewerId)
            .eq("status", "pending")
            .maybeSingle();
        viewerPendingInviteId = (myInvite as { id: string } | null)?.id ?? null;
    }

    // Phase 4: do I have a pending join request to this match? (request gate)
    let viewerHasPendingRequest = false;
    if (viewerId && !isHost && !isParticipant && match.gate === "request") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: myReq } = await (supabase as any)
            .from("match_join_requests")
            .select("status")
            .eq("match_id", id)
            .eq("requester_user_id", viewerId)
            .eq("status", "pending")
            .maybeSingle();
        viewerHasPendingRequest = Boolean(myReq);
    }

    // Phase 4: host's pending join-request queue (request gate only).
    let hostJoinRequests: Array<{
        id: string;
        requester_user_id: string;
        display_name: string | null;
        avatar_url: string | null;
        created_at: string;
    }> = [];
    if (isHost && viewerId && match.gate === "request" && match.status === "open") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: reqs } = await (supabase as any)
            .from("match_join_requests")
            .select(`
                id, requester_user_id, created_at,
                profiles!match_join_requests_requester_user_id_fkey(display_name, avatar_url)
            `)
            .eq("match_id", id)
            .eq("status", "pending")
            .order("created_at", { ascending: true });
        hostJoinRequests = ((reqs ?? []) as Array<{
            id: string; requester_user_id: string; created_at: string;
            profiles: { display_name: string | null; avatar_url: string | null } | null;
        }>).map((r) => ({
            id: r.id,
            requester_user_id: r.requester_user_id,
            display_name: r.profiles?.display_name ?? null,
            avatar_url: r.profiles?.avatar_url ?? null,
            created_at: r.created_at,
        }));
    }

    // Phase 4: chat thread for participants.
    let chatMessages: Array<{
        id: string; sender_id: string; body: string; created_at: string;
        sender_display_name: string | null; sender_avatar_url: string | null;
    }> = [];
    if (isParticipant && viewerId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: msgs } = await (supabase as any)
            .from("match_messages")
            .select(`
                id, sender_id, body, created_at,
                profiles!match_messages_sender_id_fkey(display_name, avatar_url)
            `)
            .eq("match_id", id)
            .order("created_at", { ascending: true })
            .limit(200);
        chatMessages = ((msgs ?? []) as Array<{
            id: string; sender_id: string; body: string; created_at: string;
            profiles: { display_name: string | null; avatar_url: string | null } | null;
        }>).map((m) => ({
            id: m.id,
            sender_id: m.sender_id,
            body: m.body,
            created_at: m.created_at,
            sender_display_name: m.profiles?.display_name ?? null,
            sender_avatar_url: m.profiles?.avatar_url ?? null,
        }));
    }

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
                    {(() => {
                        const display = computeDisplayStatus({
                            scheduledForIso: match.scheduled_for,
                            durationMinutes: match.duration_minutes ?? 60,
                            status: match.status,
                        });
                        if (display === "upcoming") return null;
                        if (display === "live") {
                            return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                                    {tCommon("live")}
                                </span>
                            );
                        }
                        const cls =
                            display === "cancelled" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" :
                            "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
                        return (
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>
                                {t(`status.${display === "ended" ? "completed" : display}`)}
                            </span>
                        );
                    })()}
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
                    viewerHasPendingRequest={viewerHasPendingRequest}
                />
            </div>

            {/* Invited viewer: accept / decline */}
            {viewerPendingInviteId && (
                <MatchInviteResponse inviteId={viewerPendingInviteId} matchId={match.id} />
            )}

            {/* Host invite panel */}
            {isHost && match.status === "open" && (
                <MatchHostInvites
                    matchId={match.id}
                    contacts={hostContacts}
                    groups={hostGroups}
                    invites={hostInvites}
                />
            )}

            {/* Host join-request queue (request gate) */}
            {isHost && match.gate === "request" && hostJoinRequests.length > 0 && (
                <MatchJoinRequests
                    matchId={match.id}
                    requests={hostJoinRequests}
                    locale={locale}
                />
            )}

            {/* Per-match chat (participants only) */}
            {isParticipant && viewerId && (
                <MatchChat
                    matchId={match.id}
                    viewerId={viewerId}
                    initialMessages={chatMessages}
                />
            )}

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
                                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                                        <Link
                                            href={`/${locale}/players/${p.user_id}`}
                                            className="text-sm font-medium text-gray-900 dark:text-white hover:text-emerald-600"
                                        >
                                            {p.profiles?.display_name ?? t("anonymous_player")}
                                        </Link>
                                        <SkillChip rating={p.profiles?.skill_rating} />
                                        {isThisHost && (
                                            <span className="text-[10px] uppercase font-semibold text-emerald-600 dark:text-emerald-400">
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
