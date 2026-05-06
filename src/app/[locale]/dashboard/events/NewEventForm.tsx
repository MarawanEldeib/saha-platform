"use client";

import React from "react";
import { submitEventAction } from "../actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CheckCircle } from "lucide-react";

export function NewEventForm({ facilityId }: { facilityId: string }) {
    const [error, setError] = React.useState<string | null>(null);
    const [success, setSuccess] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const formRef = React.useRef<HTMLFormElement>(null);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);
        setLoading(true);
        const fd = new FormData(e.currentTarget);
        fd.append("facility_id", facilityId);
        const result = await submitEventAction(fd);
        setLoading(false);
        if (result?.error) { setError(result.error); return; }
        setSuccess(true);
        formRef.current?.reset();
    };

    return (
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <Input label="Event name" name="name" placeholder="e.g. Open Basketball Night" required />
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (optional)</label>
                <textarea
                    name="description"
                    rows={3}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Additional details about the event…"
                />
            </div>
            <Input label="Event date & time" name="event_date" type="datetime-local" required />
            {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
            {success && (
                <p className="text-sm text-emerald-600 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" /> Event submitted for review!
                </p>
            )}
            <Button type="submit" variant="primary" loading={loading}>Submit Event</Button>
        </form>
    );
}
