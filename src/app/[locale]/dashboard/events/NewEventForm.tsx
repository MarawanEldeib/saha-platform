"use client";

import React from "react";
import { submitEventAction } from "../actions/events";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CheckCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { EventTagPicker } from "@/components/events/EventTagPicker";
import type { EventTag } from "@/lib/event-tags";

export function NewEventForm({ facilityId }: { facilityId: string }) {
    const t = useTranslations("events_form");
    const [error, setError] = React.useState<string | null>(null);
    const [success, setSuccess] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [tags, setTags] = React.useState<EventTag[]>([]);
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
        setTags([]);
        formRef.current?.reset();
    };

    return (
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
                {t("policy_notice")}
            </div>
            <Input label={t("name_label")} name="name" placeholder={t("name_placeholder")} required />
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("description_label")}</label>
                <textarea
                    name="description"
                    rows={3}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder={t("description_placeholder")}
                />
            </div>
            <Input label={t("datetime_label")} name="event_date" type="datetime-local" required />
            <EventTagPicker selected={tags} onChange={setTags} name="tags" />
            {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
            {success && (
                <p className="text-sm text-emerald-600 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" /> {t("submitted")}
                </p>
            )}
            <Button type="submit" variant="primary" loading={loading}>{t("submit")}</Button>
        </form>
    );
}
