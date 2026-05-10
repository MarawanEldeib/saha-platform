"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar, Building2, User, Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useRouter } from "next/navigation";
import { adminUpdateEventAction } from "../../actions";

interface Props {
    event: {
        id: string;
        name: string;
        description: string | null;
        event_date: string;
        facility_name: string | null;
        facility_city: string | null;
        submitter_name: string | null;
        created_at: string;
    };
}

/**
 * SAH-131: Admin can edit event content (name / description / event_date)
 * inline on the review page. Unlike the owner edit, this does NOT reset
 * the event status — admins typically fix typos while keeping the current
 * approval state.
 */
export function AdminEventCard({ event }: Props) {
    const router = useRouter();
    const [editing, setEditing] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [isPending, startTransition] = React.useTransition();

    const dateInputValue = event.event_date.slice(0, 16);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
            const result = await adminUpdateEventAction(event.id, {
                name: (fd.get("name") as string) ?? "",
                description: (fd.get("description") as string) ?? "",
                event_date: (fd.get("event_date") as string) ?? "",
            });
            if (result?.error) {
                setError(result.error);
                return;
            }
            setEditing(false);
            router.refresh();
        });
    };

    if (editing) {
        return (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-emerald-300 dark:border-emerald-800 p-6 space-y-4">
                <form onSubmit={handleSubmit} className="space-y-3">
                    <Input label="Event name" name="name" defaultValue={event.name} required />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Description
                        </label>
                        <textarea
                            name="description"
                            rows={4}
                            defaultValue={event.description ?? ""}
                            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </div>
                    <Input
                        label="Event date & time"
                        name="event_date"
                        type="datetime-local"
                        defaultValue={dateInputValue}
                        required
                    />
                    {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Admin edit — status is preserved (won&apos;t reset to pending).
                    </p>
                    <div className="flex gap-2">
                        <Button type="submit" variant="primary" loading={isPending}>Save</Button>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => { setEditing(false); setError(null); }}
                        >
                            Cancel
                        </Button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold text-gray-900 dark:text-white">{event.name}</h2>
                <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                </button>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                <span>{format(new Date(event.event_date), "PPP p")}</span>
            </div>
            {event.facility_name && (
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                    <span>{event.facility_name}{event.facility_city ? `, ${event.facility_city}` : ""}</span>
                </div>
            )}
            {event.submitter_name && (
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <User className="h-4 w-4 text-gray-400 shrink-0" />
                    <span>Submitted by {event.submitter_name}</span>
                </div>
            )}
            {event.description ? (
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed pt-2 border-t border-gray-100 dark:border-gray-800 whitespace-pre-wrap">
                    {event.description}
                </p>
            ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500 italic pt-2 border-t border-gray-100 dark:border-gray-800">
                    No description provided.
                </p>
            )}
        </div>
    );
}
