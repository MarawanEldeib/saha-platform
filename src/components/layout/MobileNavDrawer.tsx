"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Menu,
    X,
    LayoutDashboard,
    Building2,
    CalendarPlus,
    Settings,
    Trophy,
    CalendarDays,
    ScanLine,
    BookOpen,
    Users,
    DollarSign,
    ScrollText,
    MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Server Components can't pass function references (like Lucide icon
 * components) across the Server→Client boundary, so this client component
 * keeps its own icon registry and the parent passes a string key.
 */
const ICON_MAP = {
    LayoutDashboard,
    Building2,
    CalendarPlus,
    Settings,
    Trophy,
    CalendarDays,
    ScanLine,
    BookOpen,
    Users,
    DollarSign,
    ScrollText,
    MessageSquare,
} as const;

export type MobileNavIconName = keyof typeof ICON_MAP;

export interface MobileNavItem {
    href: string;
    label: string;
    icon: MobileNavIconName;
    comingSoon?: boolean;
}

interface Props {
    /** Title shown on the drawer header. */
    title: string;
    /** Optional pre-nav slot, e.g. the FacilitySwitcher. */
    headerSlot?: React.ReactNode;
    /** Nav items to render. */
    items: MobileNavItem[];
    /** Locale segment used to build hrefs. */
    locale: string;
}

/**
 * SAH-31: mobile-only nav drawer for /dashboard and /admin. The desktop
 * sidebar is `hidden md:flex` so this fills the gap on phones/tablets in
 * portrait. RTL-aware: slides in from the side that reads-from in the
 * current locale.
 */
export function MobileNavDrawer({ title, headerSlot, items, locale }: Props) {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();

    return (
        <>
            {/* Mobile-only top bar */}
            <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur sticky top-0 z-20">
                <button
                    type="button"
                    aria-label="Open navigation"
                    onClick={() => setOpen(true)}
                    className="p-2 -ms-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                    <Menu className="h-5 w-5" />
                </button>
                <h1 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{title}</h1>
            </div>

            {/* Backdrop + drawer panel */}
            {open && (
                <div className="md:hidden fixed inset-0 z-30 flex">
                    <button
                        type="button"
                        aria-label="Close navigation"
                        onClick={() => setOpen(false)}
                        className="absolute inset-0 bg-black/50"
                    />
                    <aside className="relative w-72 max-w-[85vw] bg-white dark:bg-gray-900 border-e border-gray-200 dark:border-gray-800 p-4 flex flex-col gap-1 overflow-y-auto">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
                            <button
                                type="button"
                                aria-label="Close navigation"
                                onClick={() => setOpen(false)}
                                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {headerSlot && <div className="mb-3">{headerSlot}</div>}

                        {items.map(({ href, label, icon, comingSoon }) => {
                            const Icon = ICON_MAP[icon];
                            const fullHref = `/${locale}/${href}`;
                            const active = pathname === fullHref || pathname?.startsWith(`${fullHref}/`);
                            if (comingSoon) {
                                return (
                                    <span
                                        key={href}
                                        className={cn(
                                            "flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-sm font-medium",
                                            "text-gray-400 dark:text-gray-600 cursor-not-allowed"
                                        )}
                                        title="Coming soon"
                                    >
                                        <span className="flex items-center gap-2.5">
                                            {Icon ? <Icon className="h-4 w-4" /> : null}
                                            {label}
                                        </span>
                                        <span className="text-[10px] uppercase">soon</span>
                                    </span>
                                );
                            }
                            return (
                                <Link
                                    key={href}
                                    href={fullHref}
                                    onClick={() => setOpen(false)}
                                    className={cn(
                                        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                        active
                                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                                    )}
                                >
                                    {Icon ? <Icon className="h-4 w-4" /> : null}
                                    {label}
                                </Link>
                            );
                        })}
                    </aside>
                </div>
            )}
        </>
    );
}
