"use client";

import { useState, useTransition } from "react";
import { Eye, Link as LinkIcon, MessageCircle, Check, Pencil, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useTranslations } from "next-intl";
import { updateEventAction, deleteEventAction } from "../actions/events";

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
 *
 * SAH-123: owner can also edit and delete their submitted events. Edit
 * inline (form replaces the card body), delete with a confirm step. Edits
 * reset status to 'pending' so changes go back through admin review.
 */
export function OwnerEventCard({ event, facilityName, locale, formattedDate }: Props) {
    const t = useTranslations("events_form");
    const [copied, setCopied] = useState(false);
    const [editing, setEditing] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

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

    const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
            const result = await updateEventAction(event.id, {
                name: (fd.get("name") as string) ?? "",
                description: (fd.get("description") as string) ?? "",
                event_date: (fd.get("event_date") as string) ?? "",
            });
            if (result?.error) {
                setError(result.error);
                return;
            }
            setEditing(false);
            // Server action revalidates /dashboard/events; the page rerenders
            // with fresh data on next navigation/refresh. We don't optimistic-
            // update here — the status reset to 'pending' should be visible.
        });
    };

    const handleDelete = () => {
        setError(null);
        startTransition(async () => {
            const result = await deleteEventAction(event.id);
            if (result?.error) {
                setError(result.error);
                setConfirmingDelete(false);
                return;
            }
            // The card disappears on the next render once revalidate kicks in.
        });
    };

    const baseBtn =
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors";
    const enabledBtn =
        "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800";
    const disabledBtn =
        "text-gray-400 dark:text-gray-600 cursor-not-allowed";
    const dangerBtn =
        "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30";

    // datetime-local needs YYYY-MM-DDTHH:MM (no seconds/timezone). Slice the
    // ISO string accordingly.
    const dateInputValue = event.event_date.slice(0, 16);

    if (editing) {
        return (
            <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-3">
                <form onSubmit={handleEditSubmit} className="space-y-3">
                    <Input label={t("name_label")} name="name" defaultValue={event.name} required />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t("description_label")}
                        </label>
                        <textarea
                            name="description"
                            rows={3}
                            defaultValue={event.description ?? ""}
                            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            placeholder={t("description_placeholder")}
                        />
                    </div>
                    <Input
                        label={t("datetime_label")}
                        name="event_date"
                        type="datetime-local"
                        defaultValue={dateInputValue}
                        required
                    />
                    {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t("edit_resets_status")}
                    </p>
                    <div className="flex gap-2">
                        <Button type="submit" variant="primary" loading={isPending}>{t("save")}</Button>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => { setEditing(false); setError(null); }}
                        >
                            {t("cancel")}
                        </Button>
                    </div>
                </form>
            </div>
        );
    }

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

            {error && <p className="text-sm text-red-500" role="alert">{error}</p>}

            {confirmingDelete ? (
                <div className="flex flex-col gap-2 pt-1 border-t border-gray-200 dark:border-gray-800">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                        {t("confirm_delete", { name: event.name })}
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={isPending}
                            className={`${baseBtn} bg-red-600 text-white hover:bg-red-700 disabled:opacity-60`}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            {isPending ? t("deleting") : t("confirm_delete_yes")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmingDelete(false)}
                            disabled={isPending}
                            className={`${baseBtn} ${enabledBtn}`}
                        >
                            <X className="h-3.5 w-3.5" />
                            {t("cancel")}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-end gap-2 pt-1">
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
                    <button
                        type="button"
                        onClick={() => setEditing(true)}
                        title={t("edit")}
                        className={`${baseBtn} ${enabledBtn}`}
                    >
                        <Pencil className="h-3.5 w-3.5" />
                        {t("edit")}
                    </button>
                    <button
                        type="button"
                        onClick={() => setConfirmingDelete(true)}
                        title={t("delete")}
                        className={`${baseBtn} ${dangerBtn}`}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("delete")}
                    </button>
                </div>
            )}
        </div>
    );
}
