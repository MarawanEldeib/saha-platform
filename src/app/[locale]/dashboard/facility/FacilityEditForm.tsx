"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { facilityUpdateSchema, type FacilityUpdateInput } from "@/lib/validations";
import {
    updateFacilityAction,
    updateFacilitySportsAction,
    saveFacilityHoursAction,
    generateFacilityDescriptionAction,
} from "../actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CheckCircle, Sparkles, Loader2 } from "lucide-react";
import { ImageUploader } from "@/components/facility/ImageUploader";
import type { FacilityImage } from "@/types/database";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

interface Sport { id: number; name: string }

type HourRow = {
    day_of_week: number;
    is_closed: boolean;
    open_time: string | null;
    close_time: string | null;
};

interface Props {
    facility: {
        id: string;
        name: string;
        description: string | null;
        address: string;
        city: string;
        postal_code: string | null;
        phone: string | null;
        website: string | null;
        trn?: string | null;
    };
    allSports: Sport[];
    currentSportIds: number[];
    initialImages: FacilityImage[];
    initialHours: HourRow[];
}

const TIME_OPTIONS = Array.from({ length: 37 }, (_, i) => {
    const totalMins = 6 * 60 + i * 30;
    const h = String(Math.floor(totalMins / 60)).padStart(2, "0");
    const m = String(totalMins % 60).padStart(2, "0");
    return `${h}:${m}`;
});

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function buildHourDefaults(saved: HourRow[]): HourRow[] {
    return Array.from({ length: 7 }, (_, i) => {
        const existing = saved.find((h) => h.day_of_week === i);
        return existing ?? { day_of_week: i, is_closed: false, open_time: "09:00", close_time: "22:00" };
    });
}

/**
 * SAH-66: One Save Changes button at the bottom of the page submits details,
 * sports, and hours in parallel. Photos and Stripe Connect remain async
 * (per the ticket spec — they trigger their own flows).
 */
export function FacilityEditForm({
    facility,
    allSports,
    currentSportIds,
    initialImages,
    initialHours,
}: Props) {
    const t = useTranslations("facility_form");
    const th = useTranslations("hours_form");
    const tc = useTranslations("common");
    const tSports = useTranslations("sports");
    const router = useRouter();

    const knownSports = ["Padel", "Pickleball", "Tennis", "Squash", "Badminton"] as const;
    const sportName = (name: string) =>
        knownSports.includes(name as typeof knownSports[number])
            ? tSports(name as typeof knownSports[number])
            : name;

    const [sportIds, setSportIds] = React.useState<number[]>(currentSportIds);
    const [hours, setHours] = React.useState<HourRow[]>(buildHourDefaults(initialHours));
    const [serverError, setServerError] = React.useState<string | null>(null);
    const [saved, setSaved] = React.useState(false);
    const [submitting, setSubmitting] = React.useState(false);

    const {
        register,
        handleSubmit,
        getValues,
        setValue,
        formState: { errors },
    } = useForm<FacilityUpdateInput>({
        resolver: zodResolver(facilityUpdateSchema),
        defaultValues: {
            name: facility.name,
            description: facility.description ?? "",
            address: facility.address,
            city: facility.city,
            postal_code: facility.postal_code ?? "",
            phone: facility.phone ?? "",
            website: facility.website ?? "",
            trn: facility.trn ?? "",
        },
    });

    // SAH-40: AI description generator. Hidden when ANTHROPIC_API_KEY isn't
    // configured (server returns notConfigured: true).
    const [aiPending, setAiPending] = React.useState(false);
    const [aiHidden, setAiHidden] = React.useState(false);
    const [aiError, setAiError] = React.useState<string | null>(null);
    async function generateDescription() {
        setAiError(null);
        setAiPending(true);
        try {
            const sportNames = sportIds
                .map((id) => allSports.find((s) => s.id === id)?.name)
                .filter(Boolean) as string[];
            const facilityName = getValues("name") || facility.name;
            const city = getValues("city") || facility.city;
            const result = await generateFacilityDescriptionAction({
                facilityName,
                sports: sportNames,
                city,
            });
            if ("notConfigured" in result && result.notConfigured) {
                setAiHidden(true);
                return;
            }
            if ("error" in result && result.error) {
                setAiError(result.error);
                return;
            }
            if ("description" in result && result.description) {
                setValue("description", result.description, { shouldValidate: true, shouldDirty: true });
            }
        } finally {
            setAiPending(false);
        }
    }

    function updateHourRow(index: number, patch: Partial<HourRow>) {
        setHours((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)));
        setSaved(false);
    }

    const onSubmit = async (data: FacilityUpdateInput) => {
        setServerError(null);
        setSaved(false);
        setSubmitting(true);

        try {
            // Run all three saves in parallel — they touch different tables
            // and don't depend on each other.
            const fd = new FormData();
            fd.append("facility_id", facility.id);
            Object.entries(data).forEach(([k, v]) => fd.append(k, v ?? ""));

            const [details, sports, hoursResult] = await Promise.all([
                updateFacilityAction(fd),
                updateFacilitySportsAction(facility.id, sportIds),
                saveFacilityHoursAction(facility.id, hours),
            ]);

            const firstError =
                details?.error ?? sports?.error ?? hoursResult?.error ?? null;

            if (firstError) {
                setServerError(firstError);
                return;
            }

            setSaved(true);
            router.refresh();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8" noValidate>
            {/* Basic Info */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5">{t("details_section")}</h2>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input label={t("name_label")} error={errors.name?.message} {...register("name")} />
                        <Input label={t("city_label")} error={errors.city?.message} {...register("city")} />
                    </div>
                    <Input label={t("address_label")} error={errors.address?.message} {...register("address")} />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Input label={t("postal_label")} error={errors.postal_code?.message} {...register("postal_code")} />
                        <Input label={t("phone_label")} error={errors.phone?.message} {...register("phone")} />
                        <Input label={t("website_label")} placeholder={t("website_placeholder")} error={errors.website?.message} {...register("website")} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("description_label")}</label>
                        <textarea
                            {...register("description")}
                            rows={4}
                            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            placeholder={t("description_placeholder")}
                        />
                        {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description.message}</p>}
                        {!aiHidden && (
                            <div className="mt-2 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={generateDescription}
                                    disabled={aiPending || sportIds.length === 0}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 disabled:opacity-50 transition-colors"
                                    title={sportIds.length === 0 ? "Pick at least one sport first" : ""}
                                >
                                    {aiPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                    {aiPending ? "Generating…" : "Generate with AI"}
                                </button>
                                {aiError && <span className="text-xs text-red-500">{aiError}</span>}
                            </div>
                        )}
                    </div>
                    <div>
                        <Input
                            label={t("trn_label")}
                            placeholder={t("trn_placeholder")}
                            inputMode="numeric"
                            maxLength={15}
                            error={errors.trn?.message}
                            {...register("trn")}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("trn_hint")}</p>
                    </div>
                </div>
            </div>

            {/* Photos — independent async per-image upload */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{t("photos_section")}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t("photos_hint")}</p>
                <ImageUploader facilityId={facility.id} initialImages={initialImages} />
            </div>

            {/* Sports */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{t("sports_section")}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t("sports_hint")}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {allSports.map((sport) => (
                        <button
                            key={sport.id}
                            type="button"
                            onClick={() => {
                                setSportIds((prev) =>
                                    prev.includes(sport.id) ? prev.filter((i) => i !== sport.id) : [...prev, sport.id]
                                );
                                setSaved(false);
                            }}
                            className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all text-left ${sportIds.includes(sport.id)
                                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                                : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                                }`}
                        >
                            {sportName(sport.name)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Hours */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{th("heading")}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{th("subheading")}</p>
                <div className="space-y-3">
                    {hours.map((row, i) => (
                        <div key={i} className="flex items-center gap-3 flex-wrap">
                            <span className="w-24 text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">
                                {tc(DAY_KEYS[i])}
                            </span>
                            <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 shrink-0">
                                <input
                                    type="checkbox"
                                    checked={row.is_closed}
                                    onChange={(e) => updateHourRow(i, { is_closed: e.target.checked })}
                                    className="rounded border-gray-300 dark:border-gray-600"
                                />
                                {th("closed_label")}
                            </label>
                            {!row.is_closed && (
                                <>
                                    <select
                                        value={row.open_time ?? "09:00"}
                                        onChange={(e) => updateHourRow(i, { open_time: e.target.value })}
                                        className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    >
                                        {TIME_OPTIONS.map((time) => (
                                            <option key={time} value={time}>{time}</option>
                                        ))}
                                    </select>
                                    <span className="text-sm text-gray-400">{th("to")}</span>
                                    <select
                                        value={row.close_time ?? "22:00"}
                                        onChange={(e) => updateHourRow(i, { close_time: e.target.value })}
                                        className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    >
                                        {TIME_OPTIONS.map((time) => (
                                            <option key={time} value={time}>{time}</option>
                                        ))}
                                    </select>
                                </>
                            )}
                            {row.is_closed && (
                                <span className="text-sm text-gray-400 italic">{th("closed_all_day")}</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Single sticky save bar */}
            <div className="sticky bottom-4 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur border border-gray-200 dark:border-gray-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 shadow-sm">
                <div className="flex-1 min-w-0">
                    {serverError && (
                        <p className="text-sm text-red-500" role="alert">{serverError}</p>
                    )}
                    {saved && !serverError && (
                        <p className="text-sm text-emerald-600 flex items-center gap-1">
                            <CheckCircle className="h-4 w-4" /> {t("saved")}
                        </p>
                    )}
                </div>
                <Button type="submit" variant="primary" loading={submitting}>
                    {t("save")}
                </Button>
            </div>
        </form>
    );
}
