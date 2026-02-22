import { getTranslations, getLocale } from "next-intl/server";
import Link from "next/link";
import { MapPin, Search, Users, Star, ChevronRight, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
    title: "Saha – Sports Facility Directory for Students",
    description:
        "Find sports facilities in Stuttgart and Baden-Württemberg. Search by sport, find student discounts, and connect with other players.",
};

export default async function HomePage() {
    const t = await getTranslations("home");
    const locale = await getLocale();

    const features = [
        { key: "map", icon: MapPin },
        { key: "discounts", icon: Zap },
        { key: "community", icon: Users },
        { key: "reviews", icon: Star },
    ] as const;

    // Fetch real counts + current user session in parallel
    const supabase = await createClient();
    const [facilitiesRes, sportsRes, usersRes, citiesRes, { data: { user } }] = await Promise.all([
        supabase.from("facilities").select("*", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("sports").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("facilities").select("city").eq("status", "approved"),
        supabase.auth.getUser(),
    ]);

    const facilityCount = facilitiesRes.count ?? 0;
    const sportCount = sportsRes.count ?? 0;
    const userCount = usersRes.count ?? 0;
    const cityCount = new Set(((citiesRes.data ?? []) as { city: string }[]).map((f) => f.city.toLowerCase())).size;

    const formatCount = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}k+` : n > 0 ? `${n}` : "0";

    const stats = [
        { key: "facilities", value: formatCount(facilityCount) },
        { key: "sports", value: formatCount(sportCount) },
        { key: "students", value: formatCount(userCount) },
        { key: "cities", value: formatCount(cityCount) },
    ];

    // Determine user role for smart CTA
    let userRole: string | null = null;
    if (user) {
        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();
        userRole = (profile as { role: string } | null)?.role ?? null;
    }

    return (
        <div className="flex flex-col">
            {/* ── Hero ────────────────────────────────────────────────────────── */}
            <section className="relative bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-900 overflow-hidden">
                {/* Background decorative circles */}
                <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-emerald-200/30 dark:bg-emerald-900/20 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-teal-200/30 dark:bg-teal-900/20 blur-3xl pointer-events-none" />

                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 text-center">
                    <span className="inline-flex items-center gap-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
                        <Zap className="h-3.5 w-3.5" />
                        {t("hero.badge")}
                    </span>

                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 dark:text-white tracking-tight leading-tight max-w-4xl mx-auto">
                        {t("hero.title")}
                    </h1>

                    <p className="mt-6 text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                        {t("hero.subtitle")}
                    </p>

                    <div className="mt-10 flex flex-col sm:flex-row gap-4 items-center justify-center">
                        <Link
                            href={`/${locale}/map`}
                            className="inline-flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 font-medium px-8 py-3 rounded-xl text-base shadow-sm transition-colors"
                        >
                            <MapPin className="h-5 w-5" />
                            {t("hero.cta_primary")}
                        </Link>
                        <Link
                            href={`/${locale}/community`}
                            className="inline-flex items-center gap-2 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium px-8 py-3 rounded-xl text-base transition-colors"
                        >
                            <Users className="h-5 w-5" />
                            {t("hero.cta_secondary")}
                        </Link>
                    </div>

                    <p className="mt-8 text-sm text-gray-400 dark:text-gray-600">{t("hero.tagline")}</p>
                </div>
            </section>

            {/* ── Stats Bar ───────────────────────────────────────────────────── */}
            <section className="bg-emerald-600 dark:bg-emerald-700 py-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center text-white">
                    {stats.map(({ key, value }) => (
                        <div key={key}>
                            <p className="text-3xl font-extrabold">{value}</p>
                            <p className="text-sm text-emerald-100 mt-1">{t(`stats.${key}`)}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Features ────────────────────────────────────────────────────── */}
            <section className="py-20 bg-white dark:bg-gray-950">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-14">
                        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                            {t("features.title")}
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                        {features.map(({ key, icon: Icon }) => (
                            <div
                                key={key}
                                className="group p-6 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-lg transition-all duration-200"
                            >
                                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl flex items-center justify-center mb-4 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/60 transition-colors">
                                    <Icon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                                    {t(`features.${key}.title`)}
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {t(`features.${key}.desc`)}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Business CTA — hidden for students, smart for business/guest ── */}
            {userRole !== "user" && (
                <section className="py-20 bg-gray-50 dark:bg-gray-900">
                    <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
                        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                            {t("cta_section.title")}
                        </h2>
                        <p className="mt-4 text-gray-600 dark:text-gray-400 text-lg">
                            {t("cta_section.subtitle")}
                        </p>
                        {userRole === "business" ? (
                            <Link
                                href={`/${locale}/dashboard`}
                                className="inline-flex items-center gap-2 mt-8 bg-emerald-600 text-white hover:bg-emerald-700 font-medium px-8 py-3 rounded-xl text-base shadow-sm transition-colors"
                            >
                                Go to Dashboard
                                <ChevronRight className="h-5 w-5" />
                            </Link>
                        ) : (
                            <Link
                                href={`/${locale}/register?role=business`}
                                className="inline-flex items-center gap-2 mt-8 bg-emerald-600 text-white hover:bg-emerald-700 font-medium px-8 py-3 rounded-xl text-base shadow-sm transition-colors"
                            >
                                {t("cta_section.button")}
                                <ChevronRight className="h-5 w-5" />
                            </Link>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
}
