import { createClient } from "@/lib/supabase/server";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { User, CalendarDays, Settings, Users, ChevronRight, MapPin, Wallet } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "My Account – Saha" };

export default async function AccountPage() {
    const supabase = await createClient();
    const locale = await getLocale();
    const t = await getTranslations("account");
    const tb = await getTranslations("bookings");
    const tw = await getTranslations("wallet");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("display_name, phone, avatar_url, role")
        .eq("id", user.id)
        .single();

    // SAH-125: business owners and admins live in their own workspace.
    // /account is the player-side hub (wallet, bookings, community);
    // sending owners here is confusing. Push them to where they belong.
    if (profile?.role === "business") redirect(`/${locale}/dashboard`);
    if (profile?.role === "admin") redirect(`/${locale}/admin`);

    // SAH-93: wallet balance for the loyalty card.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: walletRow } = await (supabase as any)
        .from("wallet_balances")
        .select("credit_aed")
        .eq("user_id", user.id)
        .maybeSingle();
    const walletBalance = Number(walletRow?.credit_aed ?? 0);

    const today = new Date().toISOString().slice(0, 10);

    // Next 3 upcoming confirmed bookings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: upcoming } = await (supabase as any)
        .from("bookings")
        .select("id, date, start_time, end_time, courts(name, facilities(name, city))")
        .eq("player_id", user.id)
        .gte("date", today)
        .in("status", ["confirmed", "pending"])
        .order("date")
        .order("start_time")
        .limit(3);

    const initials = (profile?.display_name ?? user.email ?? "?")
        .split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

    return (
        <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
            {/* Profile card */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 flex items-center gap-5">
                {profile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
                ) : (
                    <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold text-xl">
                        {initials}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <p className="text-lg font-bold text-gray-900 dark:text-white truncate">
                        {profile?.display_name || user.email}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                </div>
                <Link
                    href={`/${locale}/account/settings`}
                    className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                >
                    <Settings className="h-4 w-4" />
                </Link>
            </div>

            {/* SAH-93: wallet balance */}
            <Link
                href={`/${locale}/account/wallet`}
                className="block bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
            >
                <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 text-emerald-700 dark:text-emerald-400">
                            <Wallet className="h-4 w-4" />
                            <p className="text-sm font-semibold">{tw("card_title")}</p>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                            {formatPrice(walletBalance, "AED", locale)}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {walletBalance > 0 ? tw("hint_can_apply") : tw("hint_earn")}
                        </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                </div>
            </Link>

            {/* Upcoming bookings */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-emerald-500" />
                        {tb("title")}
                    </h2>
                    <Link href={`/${locale}/bookings`} className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5">
                        {t("view_all")} <ChevronRight className="h-3 w-3" />
                    </Link>
                </div>
                {(upcoming ?? []).length === 0 ? (
                    <div className="px-5 py-8 text-center space-y-3">
                        <p className="text-sm text-gray-500 dark:text-gray-400">{tb("no_bookings")}</p>
                        <Link
                            href={`/${locale}/map`}
                            className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                        >
                            <MapPin className="h-3.5 w-3.5" />
                            {tb("find_court")}
                        </Link>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                        {(upcoming ?? []).map((b: {
                            id: string; date: string; start_time: string; end_time: string;
                            courts: { name: string; facilities: { name: string; city: string } } | null;
                        }) => (
                            <li key={b.id}>
                                <Link href={`/${locale}/bookings/${b.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                    <div>
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                                            {b.courts?.facilities?.name} — {b.courts?.name}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                            {format(new Date(b.date), "EEE, MMM d")} · {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}
                                        </p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Quick links */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                {[
                    { href: `/${locale}/bookings`, icon: CalendarDays, label: t("all_bookings") },
                    { href: `/${locale}/community`, icon: Users, label: t("community_posts") },
                    { href: `/${locale}/account/settings`, icon: Settings, label: t("settings") },
                ].map(({ href, icon: Icon, label }) => (
                    <Link key={href} href={href} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <div className="flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                            <Icon className="h-4 w-4 text-gray-400" />
                            {label}
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                    </Link>
                ))}
            </div>

            {/* Account info */}
            <p className="text-center text-xs text-gray-400 dark:text-gray-600">
                <User className="h-3 w-3 inline me-1" />
                {user.email}
            </p>
        </div>
    );
}
