"use client";

import { useState } from "react";
import { Eye, Link as LinkIcon, MessageCircle, Check } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

interface Props {
    event: {
        id: string;
        name: string;
        description: string | null;
        event_date: string;
        status: "pending" | "approved" | "rejected";
    };
    facilityName?: string | null;
    locale: string;
    formattedDate: string;
}

/**
 * SAH-107: Owner-side event card on /dashboard/events.
 * Approved events get View / Copy link / WhatsApp share.
 * Pending and rejected events show the buttons disabled with a title hint.
 */
export function OwnerEventCard({ event, facilityName, locale, formattedDate }: Props) {
    const [copied, setCopied] = useState(false);
    const [shareReady, setShareReady] = useState(false);

    // Build the URL on the client so absolute links work even when
    // NEXT_PUBLIC_APP_URL isn't perfectly set.
    if (typeof window !== "undefined" && !shareReady) {
        setShareReady(true);
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/${locale}/events/${event.id}`;

    const isApproved = event.status === "approved";
    const tooltip = isApproved ? "" : "Available after admin approval";

    const handleCopy = async () => {
        if (!isApproved) return;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard API unavailable — leave the icon unchanged */
        }
    };

    const handleWhatsApp = () => {
        if (!isApproved) return;
        const message = facilityName
            ? `Check out this event at ${facilityName}: ${url}`
            : `Check out this event: ${url}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    };

    const baseBtn =
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors";
    const enabledBtn =
        "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800";
    const disabledBtn =
        "text-gray-400 dark:text-gray-600 cursor-not-allowed";

    return (
        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/50 space-y-3">
            <div className="flex justify-between items-start gap-3">
                <h3 className="font-semibold text-gray-900 dark:text-white truncate">{event.name}</h3>
                <Badge variant={isApproved ? "success" : event.status === "rejected" ? "danger" : "warning"}>
                    {event.status}
                </Badge>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                {event.description || "No description provided."}
            </p>
            <p className="text-xs text-gray-500 font-medium">{formattedDate}</p>

            <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-1">
                <a
                    href={isApproved ? `/${locale}/events/${event.id}` : undefined}
                    target={isApproved ? "_blank" : undefined}
                    rel={isApproved ? "noopener noreferrer" : undefined}
                    aria-disabled={!isApproved}
                    title={tooltip || "Open in new tab"}
                    onClick={(e) => { if (!isApproved) e.preventDefault(); }}
                    className={`${baseBtn} ${isApproved ? enabledBtn : disabledBtn}`}
                >
                    <Eye className="h-3.5 w-3.5" />
                    View
                </a>
                <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!isApproved}
                    title={tooltip || (copied ? "Copied!" : "Copy event link")}
                    className={`${baseBtn} ${isApproved ? enabledBtn : disabledBtn}`}
                >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <LinkIcon className="h-3.5 w-3.5" />}
                    {copied ? "Copied!" : "Copy link"}
                </button>
                <button
                    type="button"
                    onClick={handleWhatsApp}
                    disabled={!isApproved}
                    title={tooltip || "Share on WhatsApp"}
                    className={`${baseBtn} ${isApproved ? enabledBtn : disabledBtn}`}
                >
                    <MessageCircle className="h-3.5 w-3.5" />
                    WhatsApp
                </button>
            </div>
        </div>
    );
}
