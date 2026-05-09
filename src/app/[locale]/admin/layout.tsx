import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Building2,
    CalendarDays,
    Users,
    BookOpen,
    DollarSign,
    ScrollText,
    Settings,
    ShieldCheck,
} from "lucide-react";
import { MobileNavDrawer, type MobileNavIconName } from "@/components/layout/MobileNavDrawer";

interface NavItem {
    href: string;
    labelKey: "overview" | "users" | "facilities" | "bookings" | "finance" | "events" | "audit_log" | "settings";
    icon: typeof LayoutDashboard;
    /** Icon name passed to the client-side mobile drawer (Server→Client
     * boundary can't carry function references). */
    iconName: MobileNavIconName;
    /** Pages we haven't built yet — render disabled in the sidebar. */
    comingSoon?: boolean;
}

const navItems: NavItem[] = [
    { href: "admin", labelKey: "overview", icon: LayoutDashboard, iconName: "LayoutDashboard" },
    { href: "admin/users", labelKey: "users", icon: Users, iconName: "Users", comingSoon: true },
    { href: "admin/facilities", labelKey: "facilities", icon: Building2, iconName: "Building2" },
    { href: "admin/bookings", labelKey: "bookings", icon: BookOpen, iconName: "BookOpen", comingSoon: true },
    { href: "admin/finance", labelKey: "finance", icon: DollarSign, iconName: "DollarSign", comingSoon: true },
    { href: "admin/events", labelKey: "events", icon: CalendarDays, iconName: "CalendarDays" },
    { href: "admin/audit-log", labelKey: "audit_log", icon: ScrollText, iconName: "ScrollText" },
    { href: "admin/settings", labelKey: "settings", icon: Settings, iconName: "Settings", comingSoon: true },
];

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const locale = await getLocale();
    const tNav = await getTranslations("admin_nav");
    const tCommon = await getTranslations("common");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (!profile || (profile as { role: string }).role !== "admin") {
        redirect(`/${locale}`);
    }

    return (
        <div className="flex flex-col md:flex-row min-h-[calc(100vh-4rem)]">
            {/* Mobile drawer + top bar (SAH-31) */}
            <MobileNavDrawer
                title={tNav("super_admin")}
                items={navItems.map(({ href, labelKey, iconName, comingSoon }) => ({
                    href, label: tNav(labelKey), icon: iconName, comingSoon,
                }))}
                locale={locale}
            />

            <aside className="hidden md:flex flex-col w-56 shrink-0 bg-white dark:bg-gray-900 border-e border-gray-200 dark:border-gray-800 p-4 gap-1">
                <div className="flex items-center gap-2 px-3 py-2 mb-2 text-emerald-700 dark:text-emerald-400">
                    <ShieldCheck className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-wide">{tNav("super_admin")}</span>
                </div>
                {navItems.map(({ href, labelKey, icon: Icon, comingSoon }) => (
                    comingSoon ? (
                        <span
                            key={href}
                            className={cn(
                                "flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-sm font-medium",
                                "text-gray-400 dark:text-gray-600 cursor-not-allowed"
                            )}
                            title={tCommon("coming_soon")}
                        >
                            <span className="flex items-center gap-2.5">
                                <Icon className="h-4 w-4" />
                                {tNav(labelKey)}
                            </span>
                            <span className="text-[10px] uppercase">{tCommon("soon")}</span>
                        </span>
                    ) : (
                        <Link
                            key={href}
                            href={`/${locale}/${href}`}
                            className={cn(
                                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                                "dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            {tNav(labelKey)}
                        </Link>
                    )
                ))}
            </aside>

            <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">{children}</main>
        </div>
    );
}
