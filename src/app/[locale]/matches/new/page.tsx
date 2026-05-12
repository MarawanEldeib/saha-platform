/**
 * SAH-152 Phase 2: /matches/new — post a game.
 *
 * Server wrapper pre-fetches sports + the caller's role and hands off to the
 * client form component. Non-authenticated users are redirected to /login,
 * non-player accounts (facility owners / admins) are sent back to /matches
 * with an explanatory page rather than rendering a form that would always
 * fail at submit.
 */

import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewMatchForm } from "./NewMatchForm";

export const metadata = { title: "Post a Game — Saha" };

export default async function NewMatchPage() {
    const locale = await getLocale();
    const t = await getTranslations("matches_new");
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login?next=/${locale}/matches/new`);

    const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single();
    const role = (profile as { role: string } | null)?.role ?? null;

    if (role !== "user") {
        return (
            <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                        {t("non_player_title")}
                    </h1>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        {t("non_player_body")}
                    </p>
                    <Link
                        href={`/${locale}/matches`}
                        className="mt-4 inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm"
                    >
                        {t("back_to_feed")}
                    </Link>
                </div>
            </div>
        );
    }

    const { data: sportsData } = await supabase
        .from("sports")
        .select("id, name")
        .in("name", ["Padel", "Pickleball", "Tennis", "Squash", "Badminton"])
        .order("name");

    const sports = (sportsData ?? []) as Array<{ id: number; name: string }>;

    return (
        <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                    {t("title")}
                </h1>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{t("subtitle")}</p>
            </div>
            <NewMatchForm sports={sports} />
        </div>
    );
}
