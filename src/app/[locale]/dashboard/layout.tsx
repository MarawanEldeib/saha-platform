import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Building2,
    CalendarPlus,
    Settings,
    Trophy,
    CalendarDays,
    ScanLine,
} from "lucide-react";

const navItems = [
    { href: "dashboard", labelKey: "overview", icon: LayoutDashboard },
    { href: "dashboard/facility", labelKey: "facility", icon: Building2 },
    { href: "dashboard/courts", labelKey: "courts", icon: Trophy },
    { href: "dashboard/availability", labelKey: "availability", icon: CalendarDays },
    { href: "dashboard/checkin", labelKey: "checkin", icon: ScanLine },
    { href: "dashboard/events", labelKey: "events", icon: CalendarPlus },
    { href: "dashboard/settings", labelKey: "settings", icon: Settings },
];

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const locale = await getLocale();
    const t = await getTranslations("dashboard.nav");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect(`/${locale}/login`);

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (!profile || (profile.role !== "business" && profile.role !== "admin")) {
        redirect(`/${locale}`);
    }

    return (
        <div className="flex min-h-[calc(100vh-4rem)]">
            {/* Sidebar */}
            <aside className="hidden md:flex flex-col w-56 shrink-0 bg-white dark:bg-gray-900 border-e border-gray-200 dark:border-gray-800 p-4 gap-1">
                {navItems.map(({ href, labelKey, icon: Icon }) => (
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
                        {t(labelKey)}
                    </Link>
                ))}
            </aside>

            <main className="flex-1 p-6 lg:p-8 overflow-auto">{children}</main>
        </div>
    );
}
