import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "outline";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
    default: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    danger: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    outline: "border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-300",
};

export function Badge({ className, variant = "default", children, ...props }: BadgeProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                variantClasses[variant],
                className
            )}
            {...props}
        >
            {children}
        </span>
    );
}

/** Maps a facility status string to Badge variant */
export function FacilityStatusBadge({ status }: { status: string }) {
    const map: Record<string, BadgeVariant> = {
        active: "success",
        pending: "warning",
        suspended: "danger",
    };
    const labels: Record<string, string> = {
        active: "Active",
        pending: "Pending",
        suspended: "Suspended",
    };
    return <Badge variant={map[status] ?? "default"}>{labels[status] ?? status}</Badge>;
}

export function EventStatusBadge({ status }: { status: string }) {
    const map: Record<string, BadgeVariant> = {
        approved: "success",
        pending: "warning",
        rejected: "danger",
    };
    const labels: Record<string, string> = {
        approved: "Approved",
        pending: "Pending",
        rejected: "Rejected",
    };
    return <Badge variant={map[status] ?? "default"}>{labels[status] ?? status}</Badge>;
}
