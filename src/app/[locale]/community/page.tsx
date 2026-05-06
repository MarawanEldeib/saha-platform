"use client";

import React from "react";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { Input } from "@/components/ui/Input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { matchmakingSchema, type MatchmakingInput } from "@/lib/validations";
import { Calendar, MessageSquare, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { format } from "date-fns";
import type { Sport } from "@/types/database";
import { useRouter } from "next/navigation";

interface Post {
    id: string;
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
    const locale = useLocale();
    const router = useRouter();

    const [posts, setPosts] = React.useState<Post[]>([]);
    const [sports, setSports] = React.useState<Sport[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [showForm, setShowForm] = React.useState(false);
    const [serverError, setServerError] = React.useState<string | null>(null);

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
            const [{ data: postsData }, { data: sportsData }] = await Promise.all([
                supabase
                    .from("matchmaking_posts")
                    .select("*, sports(name), profiles(display_name)")
                    .eq("is_active", true)
                    .order("created_at", { ascending: false }),
                supabase.from("sports").select("*").order("name"),
            ]);
            if (postsData) setPosts(postsData as Post[]);
            if (sportsData) setSports(sportsData);
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

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("title")}</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1.5">{t("subtitle")}</p>
                </div>
                <Button variant="primary" onClick={() => setShowForm(!showForm)}>
                    {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {showForm ? "Cancel" : t("new_post")}
                </Button>
            </div>

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
                                    <option value="">Any sport</option>
                                    {sports.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                        <Input label="Location (optional)" type="text" placeholder="e.g. Mitte Stuttgart" {...register("location_text")} />
                        <Textarea label={t("message_label")} placeholder="Describe what you're looking for..." error={errors.message?.message} {...register("message")} />
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
                                    {post.profiles?.display_name ?? "Anonymous"}
                                </p>
                                <div className="flex items-center gap-2 shrink-0">
                                    {post.sports && (
                                        <Badge variant="outline">{post.sports.name}</Badge>
                                    )}
                                    <Badge variant={skillBadgeVariant[post.skill_level] ?? "default"}>
                                        {post.skill_level}
                                    </Badge>
                                </div>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300">{post.message}</p>
                            <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {format(new Date(post.post_date), "PP")}</span>
                                {post.location_text && <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> {post.location_text}</span>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
