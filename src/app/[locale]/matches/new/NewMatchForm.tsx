"use client";

/**
 * SAH-152 Phase 2: client form that submits to createMatchAction.
 *
 * Mirrors the existing `/community` form's conventions (react-hook-form +
 * zodResolver) but adds the post-a-game-specific fields: title, scheduled
 * timestamp, format, capacity, gate. Capacity is bounded 1–50 by the DB
 * check; format is a free-text field with quick-pick chips for the common
 * shapes (1v1, 2v2, 5v5, etc.).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { matchCreateSchema, type MatchCreateInput } from "@/lib/validations";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createMatchAction } from "../actions";

const FORMAT_QUICK_PICKS = ["1v1", "2v2", "5v5", "7v7", "casual"] as const;

interface NewMatchFormProps {
    sports: Array<{ id: number; name: string }>;
}

export function NewMatchForm({ sports }: NewMatchFormProps) {
    const t = useTranslations("matches_new");
    const tSports = useTranslations("sports");
    const tCommon = useTranslations("matches");
    const locale = useLocale();
    const router = useRouter();
    const [submitting, setSubmitting] = React.useState(false);
    const [serverError, setServerError] = React.useState<string | null>(null);

    // Default scheduled_for = tomorrow at 18:00 in caller's local TZ.
    const defaultScheduled = React.useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(18, 0, 0, 0);
        // <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm"
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }, []);

    const {
        register, handleSubmit, formState: { errors }, setValue, watch,
    } = useForm<MatchCreateInput>({
        resolver: zodResolver(matchCreateSchema),
        defaultValues: {
            title: "",
            sport_id: null,
            court_id: null,
            location_text: "",
            scheduled_for: defaultScheduled,
            skill_level: "intermediate",
            format: "casual",
            capacity: 4,
            gate: "open",
            description: "",
        },
    });

    const watchedFormat = watch("format");
    const watchedGate = watch("gate");

    async function onSubmit(values: MatchCreateInput) {
        setServerError(null);
        setSubmitting(true);
        // Convert the datetime-local string to an ISO timestamp.
        const isoScheduled = new Date(values.scheduled_for).toISOString();
        const result = await createMatchAction({ ...values, scheduled_for: isoScheduled });
        setSubmitting(false);
        if (!result.ok) {
            setServerError(result.error);
            return;
        }
        router.push(`/${locale}/matches/${result.data!.matchId}`);
        router.refresh();
    }

    const knownSports = ["Padel", "Pickleball", "Tennis", "Squash", "Badminton"] as const;
    const sportLabel = (name: string) =>
        knownSports.includes(name as typeof knownSports[number])
            ? tSports(name as typeof knownSports[number])
            : name;

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Title */}
            <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("title_label")}
                </label>
                <Input
                    id="title"
                    placeholder={t("title_placeholder")}
                    {...register("title")}
                />
                {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title.message}</p>}
            </div>

            {/* Sport */}
            <div>
                <label htmlFor="sport_id" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("sport_label")}
                </label>
                <select
                    id="sport_id"
                    {...register("sport_id", {
                        setValueAs: (v) => (v === "" || v == null ? null : Number(v)),
                    })}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                    <option value="">{t("sport_any")}</option>
                    {sports.map((s) => (
                        <option key={s.id} value={s.id}>{sportLabel(s.name)}</option>
                    ))}
                </select>
            </div>

            {/* Scheduled for */}
            <div>
                <label htmlFor="scheduled_for" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("scheduled_label")}
                </label>
                <input
                    id="scheduled_for"
                    type="datetime-local"
                    {...register("scheduled_for")}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {errors.scheduled_for && <p className="text-xs text-red-500 mt-1">{errors.scheduled_for.message}</p>}
            </div>

            {/* Location */}
            <div>
                <label htmlFor="location_text" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("location_label")}
                </label>
                <Input
                    id="location_text"
                    placeholder={t("location_placeholder")}
                    {...register("location_text")}
                />
            </div>

            {/* Skill */}
            <div>
                <label htmlFor="skill_level" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("skill_label")}
                </label>
                <select
                    id="skill_level"
                    {...register("skill_level")}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                    <option value="beginner">{tCommon("skill.beginner")}</option>
                    <option value="intermediate">{tCommon("skill.intermediate")}</option>
                    <option value="advanced">{tCommon("skill.advanced")}</option>
                    <option value="competitive">{tCommon("skill.competitive")}</option>
                </select>
            </div>

            {/* Format quick-picks */}
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("format_label")}
                </label>
                <div className="flex flex-wrap gap-2">
                    {FORMAT_QUICK_PICKS.map((fmt) => (
                        <button
                            type="button"
                            key={fmt}
                            onClick={() => setValue("format", fmt)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                watchedFormat === fmt
                                    ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                                    : "border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-emerald-300"
                            }`}
                        >
                            {fmt === "casual" ? tCommon("format_casual") : fmt}
                        </button>
                    ))}
                </div>
            </div>

            {/* Capacity */}
            <div>
                <label htmlFor="capacity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("capacity_label")}
                </label>
                <Input
                    id="capacity"
                    type="number"
                    min={1}
                    max={50}
                    {...register("capacity", { valueAsNumber: true })}
                />
                {errors.capacity && <p className="text-xs text-red-500 mt-1">{errors.capacity.message}</p>}
            </div>

            {/* Gate */}
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t("gate_label")}
                </label>
                <div className="space-y-2">
                    {(["open", "request", "invite_only"] as const).map((g) => (
                        <label
                            key={g}
                            className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                                watchedGate === g
                                    ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30"
                                    : "border-gray-200 dark:border-gray-800"
                            }`}
                        >
                            <input type="radio" value={g} {...register("gate")} className="mt-0.5" />
                            <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                    {t(`gate.${g}.title`)}
                                </div>
                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                    {t(`gate.${g}.desc`)}
                                </div>
                            </div>
                        </label>
                    ))}
                </div>
            </div>

            {/* Description */}
            <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("description_label")}
                </label>
                <Textarea
                    id="description"
                    rows={3}
                    placeholder={t("description_placeholder")}
                    {...register("description")}
                />
            </div>

            {serverError && (
                <p className="text-sm text-red-500" role="alert">
                    {serverError}
                </p>
            )}

            <div className="flex items-center gap-3">
                <Button type="submit" disabled={submitting}>
                    {submitting ? t("submitting") : t("submit")}
                </Button>
                <Button type="button" variant="ghost" onClick={() => router.back()}>
                    {t("cancel")}
                </Button>
            </div>
        </form>
    );
}
