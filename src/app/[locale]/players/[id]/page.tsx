import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { format } from "date-fns";
import { Calendar, MapPin, ArrowLeft, User as UserIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { SkillChip } from "@/components/matches/SkillChip";
import type { Metadata } from "next";

// SAH-152 round 3: public profile browsing. Players who see a matchmaking
// request can tap the poster's name/avatar and land here to verify who
// they're about to DM. Reuses the `public_profiles` view (RLS-safe set of
// columns) — no email, no phone, no role-elevation surface.

export const metadata: Metadata = { title: "Player – Saha" };

interface ProfileRow {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    created_at: string;
    skill_rating: number | string | null;
}

interface PostRow {
    id: string;
    message: string;
    post_date: string;
    skill_level: string;
    location_text: string | null;
    preferred_times: string[] | null;
    is_active: boolean;
    created_at: string;
    sports: { name: string } | null;
}

const skillBadgeVariant: Record<string, "info" | "warning" | "danger" | "default"> = {
    beginner: "info",
    intermediate: "warning",
    advanced: "danger",
    competitive: "default",
};

export default async function PlayerProfilePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const supabase = await createClient();
    const locale = await getLocale();
    const t = await getTranslations("player_profile");
    const tc = await getTranslations("community");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
        .from("public_profiles")
        .select("id, display_name, avatar_url, created_at, skill_rating")
        .eq("id", id)
        .single();

    if (!profile) notFound();
    const p = profile as ProfileRow;

    // Their open matchmaking posts (matches what Community page surfaces).
    // Server Component — Date.now() at request time is intentional.
    // eslint-disable-next-line react-hooks/purity
    const nowMs = Date.now();
    const fourteenDaysAgo = new Date(nowMs - 14 * 24 * 3600 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: posts } = await (supabase as any)
        .from("matchmaking_posts")
        .select("id, message, post_date, skill_level, location_text, preferred_times, is_active, created_at, sports(name)")
        .eq("user_id", id)
        .eq("is_active", true)
        .gte("created_at", fourteenDaysAgo)
        .order("created_at", { ascending: false });

    const activePosts = (posts ?? []) as PostRow[];
    const displayName = p.display_name ?? tc("anonymous");
    const initial = (displayName.trim()[0] ?? "?").toUpperCase();

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">
            <Link
                href={`/${locale}/community`}
                className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
                <ArrowLeft className="h-4 w-4" />
                {t("back_to_community")}
            </Link>

            {/* Header card */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 flex items-center gap-4">
                {p.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={p.avatar_url}
                        alt=""
                        className="h-16 w-16 rounded-full object-cover bg-gray-100 dark:bg-gray-800"
                    />
                ) : (
                    <div className="h-16 w-16 rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-2xl font-semibold">
                        {initial === "?" ? <UserIcon className="h-7 w-7" /> : initial}
                    </div>
                )}
                <div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{displayName}</h1>
                        <SkillChip rating={p.skill_rating} size="sm" />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        {t("joined_on", { date: format(new Date(p.created_at), "MMM yyyy") })}
                    </p>
                </div>
            </div>

            {/* Active matchmaking posts */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {t("active_posts_title")}
                </h2>
                {activePosts.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t("no_active_posts")}</p>
                ) : (
                    <div className="space-y-3">
                        {activePosts.map((post) => (
                            <div
                                key={post.id}
                                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-2"
                            >
                                <div className="flex items-center gap-2">
                                    {post.sports && (
                                        <Badge variant="outline">{post.sports.name}</Badge>
                                    )}
                                    <Badge variant={skillBadgeVariant[post.skill_level] ?? "default"}>
                                        {tc(`level_${post.skill_level}` as "level_beginner" | "level_intermediate" | "level_advanced" | "level_competitive")}
                                    </Badge>
                                </div>
                                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{post.message}</p>
                                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                                    <span className="inline-flex items-center gap-1">
                                        <Calendar className="h-3.5 w-3.5" />
                                        {format(new Date(post.post_date), "PP")}
                                    </span>
                                    {post.location_text && (
                                        <span className="inline-flex items-center gap-1">
                                            <MapPin className="h-3.5 w-3.5" />
                                            {post.location_text}
                                        </span>
                                    )}
                                    {post.preferred_times?.map((slot) => (
                                        <span
                                            key={slot}
                                            className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 font-medium"
                                        >
                                            {tc(`time_${slot}` as "time_morning" | "time_afternoon" | "time_evening")}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
