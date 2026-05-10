"use client";

import React from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { Input } from "@/components/ui/Input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { matchmakingSchema, type MatchmakingInput } from "@/lib/validations";
import { Calendar, MessageSquare, Plus, X, Info } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { format } from "date-fns";
import type { Sport } from "@/types/database";
import { useRouter } from "next/navigation";

interface Post {
    id: string;
    user_id: string;
    message: string;
    post_date: string;
    skill_level: string;
    location_text: string | null;
    sports: { name: string } | null;
    profiles: { display_name: string | null };
}

const skillBadgeVariant: Record<string, "info" | "warning" | "danger"> = {
    beginner: "info",
    intermediate: "warning",
    advanced: "danger",
};

export default function CommunityPage() {
    const t = useTranslations("community");
    const tc = useTranslations("common");
    const tSports = useTranslations("sports");
    const locale = useLocale();
    const knownSports = ["Padel", "Pickleball", "Tennis", "Squash", "Badminton"] as const;
    const sportName = (name: string) =>
        knownSports.includes(name as typeof knownSports[number]) ? tSports(name as typeof knownSports[number]) : name;
    const router = useRouter();

    const [posts, setPosts] = React.useState<Post[]>([]);
    const [sports, setSports] = React.useState<Sport[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [showForm, setShowForm] = React.useState(false);
    const [serverError, setServerError] = React.useState<string | null>(null);
    const [authState, setAuthState] = React.useState<
        | { status: "loading" }
        | { status: "anonymous" }
        | { status: "player"; userId: string }
        | { status: "non_player"; role: "business" | "admin" }
    >({ status: "loading" });
    const [messagingPost, setMessagingPost] = React.useState<Post | null>(null);
    const [messageDraft, setMessageDraft] = React.useState("");
    const [messageSending, setMessageSending] = React.useState(false);
    const [messageError, setMessageError] = React.useState<string | null>(null);

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        formState: { errors, isSubmitting },
    } = useForm<MatchmakingInput>({
        resolver: zodResolver(matchmakingSchema),
        defaultValues: { skill_level: "beginner", sport_id: null },
    });

    React.useEffect(() => {
        const fetchData = async () => {
            const supabase = createClient();
            const [{ data: postsData }, { data: sportsData }, { data: { user } }] = await Promise.all([
                supabase
                    .from("matchmaking_posts")
                    .select("*, sports(name), profiles(display_name)")
                    .eq("is_active", true)
                    .order("created_at", { ascending: false }),
                supabase.from("sports").select("*").in("name", ["Padel", "Pickleball", "Squash", "Tennis", "Badminton"]).order("name"),
                supabase.auth.getUser(),
            ]);
            if (postsData) setPosts(postsData as Post[]);
            if (sportsData) setSports(sportsData);

            if (!user) {
                setAuthState({ status: "anonymous" });
            } else {
                const { data: profile } = await supabase
                    .from("profiles")
                    .select("role")
                    .eq("id", user.id)
                    .single();
                const role = (profile as { role: string } | null)?.role;
                if (role === "user") setAuthState({ status: "player", userId: user.id });
                else if (role === "business" || role === "admin") setAuthState({ status: "non_player", role });
                else setAuthState({ status: "anonymous" });
            }

            setLoading(false);
        };
        fetchData();
    }, []);

    const onSubmit = async (data: MatchmakingInput) => {
        setServerError(null);
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            router.push(`/${locale}/login`);
            return;
        }
        const { error } = await supabase.from("matchmaking_posts").insert({
            user_id: user.id,
            sport_id: data.sport_id,
            skill_level: data.skill_level,
            post_date: data.post_date,
            message: data.message,
            location_text: data.location_text ?? null,
        });
        if (error) { setServerError(error.message); return; }
        reset();
        setShowForm(false);
        // Refresh posts
        const { data: postsData } = await supabase
            .from("matchmaking_posts")
            .select("*, sports(name), profiles(display_name)")
            .eq("is_active", true)
            .order("created_at", { ascending: false });
        if (postsData) setPosts(postsData as Post[]);
    };

    const canPost = authState.status === "player";
    const myUserId = authState.status === "player" ? authState.userId : null;

    async function sendQuickMessage() {
        if (!messagingPost || !myUserId) return;
        const body = messageDraft.trim();
        if (!body) return;
        setMessageSending(true);
        setMessageError(null);
        try {
            const { sendMessageAction } = await import("../messages/actions");
            const result = await sendMessageAction(messagingPost.user_id, body, messagingPost.id);
            if (!result.ok) {
                setMessageError(result.error);
                return;
            }
            // Route into the new conversation thread.
            router.push(`/${locale}/messages/${result.conversationId}`);
        } finally {
            setMessageSending(false);
        }
    }

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
            <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1.5">{t("subtitle")}</p>
                </div>
                {canPost && (
                    <Button variant="primary" onClick={() => setShowForm(!showForm)}>
                        {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        {showForm ? tc("cancel") : t("new_post")}
                    </Button>
                )}
                {authState.status === "anonymous" && (
                    <Link
                        href={`/${locale}/login?next=/${locale}/community`}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
                    >
                        {t("login_prompt")}
                    </Link>
                )}
            </div>

            {authState.status === "non_player" && (
                <div className="mb-8 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-start gap-3">
                    <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1 text-sm">
                        <p className="font-medium text-amber-900 dark:text-amber-200">{t("non_player_title")}</p>
                        <p className="text-amber-800 dark:text-amber-300 mt-1">{t("non_player_body")}</p>
                    </div>
                </div>
            )}

            {showForm && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-8 shadow-sm">
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t("sport_label")}</label>
                                <select
                                    onChange={(e) => setValue("sport_id", e.target.value ? Number(e.target.value) : null)}
                                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                >
                                    <option value="">{t("any_sport")}</option>
                                    {sports.map((s) => <option key={s.id} value={s.id}>{sportName(s.name)}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t("level_label")}</label>
                                <select
                                    {...register("skill_level")}
                                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                >
                                    <option value="beginner">{t("level_beginner")}</option>
                                    <option value="intermediate">{t("level_intermediate")}</option>
                                    <option value="advanced">{t("level_advanced")}</option>
                                </select>
                            </div>
                        </div>
                        <Input label={t("date_label")} type="date" error={errors.post_date?.message} {...register("post_date")} />
                        <Input label={t("location_label")} type="text" placeholder={t("location_placeholder")} {...register("location_text")} />
                        <Textarea label={t("message_label")} placeholder={t("message_placeholder")} error={errors.message?.message} {...register("message")} />
                        {serverError && <p className="text-sm text-red-500" role="alert">{serverError}</p>}
                        <Button type="submit" variant="primary" loading={isSubmitting}>{t("submit")}</Button>
                    </form>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
                </div>
            ) : posts.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-12">{t("no_posts")}</p>
            ) : (
                <div className="space-y-4">
                    {posts.map((post) => (
                        <div key={post.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <p className="font-medium text-gray-900 dark:text-white">
                                    {post.profiles?.display_name ?? t("anonymous")}
                                </p>
                                <div className="flex items-center gap-2 shrink-0">
                                    {post.sports && (
                                        <Badge variant="outline">{sportName(post.sports.name)}</Badge>
                                    )}
                                    <Badge variant={skillBadgeVariant[post.skill_level] ?? "default"}>
                                        {t(`level_${post.skill_level}` as "level_beginner" | "level_intermediate" | "level_advanced")}
                                    </Badge>
                                </div>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300">{post.message}</p>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {format(new Date(post.post_date), "PP")}</span>
                                {post.location_text && <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> {post.location_text}</span>}
                                {canPost && myUserId && post.user_id !== myUserId && (
                                    <button
                                        type="button"
                                        onClick={() => { setMessagingPost(post); setMessageDraft(""); setMessageError(null); }}
                                        className="ms-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                                    >
                                        <MessageSquare className="h-3.5 w-3.5" />
                                        {t("message_player")}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Quick-message modal */}
            {messagingPost && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl w-full max-w-md p-5 space-y-4">
                        <div>
                            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                                {t("message_to", { name: messagingPost.profiles?.display_name ?? t("anonymous") })}
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 truncate">
                                re: &quot;{messagingPost.message.slice(0, 80)}{messagingPost.message.length > 80 ? "…" : ""}&quot;
                            </p>
                        </div>
                        <textarea
                            value={messageDraft}
                            onChange={(e) => setMessageDraft(e.target.value)}
                            placeholder={t("message_placeholder")}
                            rows={4}
                            maxLength={2000}
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                            autoFocus
                        />
                        {messageError && <p className="text-xs text-red-500" role="alert">{messageError}</p>}
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="ghost"
                                onClick={() => { setMessagingPost(null); setMessageDraft(""); setMessageError(null); }}
                            >
                                {tc("cancel")}
                            </Button>
                            <Button
                                variant="primary"
                                loading={messageSending}
                                onClick={sendQuickMessage}
                                disabled={!messageDraft.trim()}
                            >
                                {t("send")}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
