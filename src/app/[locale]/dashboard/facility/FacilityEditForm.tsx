"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { facilityUpdateSchema, type FacilityUpdateInput } from "@/lib/validations";
import { updateFacilityAction, updateFacilitySportsAction } from "../actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CheckCircle } from "lucide-react";
import { ImageUploader } from "@/components/facility/ImageUploader";
import type { FacilityImage } from "@/types/database";
import { useTranslations } from "next-intl";

interface Sport { id: number; name: string }

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
    };
    allSports: Sport[];
    currentSportIds: number[];
    initialImages: FacilityImage[];
}

export function FacilityEditForm({ facility, allSports, currentSportIds, initialImages }: Props) {
    const t = useTranslations("facility_form");
    const tSports = useTranslations("sports");
    const knownSports = ["Padel", "Pickleball", "Tennis", "Squash", "Badminton"] as const;
    const sportName = (name: string) =>
        knownSports.includes(name as typeof knownSports[number]) ? tSports(name as typeof knownSports[number]) : name;
    const [serverError, setServerError] = React.useState<string | null>(null);
    const [saved, setSaved] = React.useState(false);
    const [sportIds, setSportIds] = React.useState<number[]>(currentSportIds);
    const [sportsError, setSportsError] = React.useState<string | null>(null);
    const [sportsSaved, setSportsSaved] = React.useState(false);

    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FacilityUpdateInput>({
        resolver: zodResolver(facilityUpdateSchema),
        defaultValues: {
            name: facility.name,
            description: facility.description ?? "",
            address: facility.address,
            city: facility.city,
            postal_code: facility.postal_code ?? "",
            phone: facility.phone ?? "",
            website: facility.website ?? "",
        },
    });

    const onSubmit = async (data: FacilityUpdateInput) => {
        setServerError(null);
        setSaved(false);
        const fd = new FormData();
        fd.append("facility_id", facility.id);
        Object.entries(data).forEach(([k, v]) => fd.append(k, v ?? ""));
        const result = await updateFacilityAction(fd);
        if (result?.error) setServerError(result.error);
        else setSaved(true);
    };

    const saveSports = async () => {
        setSportsError(null);
        setSportsSaved(false);
        const result = await updateFacilitySportsAction(facility.id, sportIds);
        if (result?.error) setSportsError(result.error);
        else setSportsSaved(true);
    };

    return (
        <div className="space-y-8">
            {/* Basic Info */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5">{t("details_section")}</h2>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
                    </div>

                    {serverError && <p className="text-sm text-red-500" role="alert">{serverError}</p>}
                    {saved && (
                        <p className="text-sm text-emerald-600 flex items-center gap-1">
                            <CheckCircle className="h-4 w-4" /> {t("saved")}
                        </p>
                    )}
                    <Button type="submit" variant="primary" loading={isSubmitting}>{t("save")}</Button>
                </form>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{t("photos_section")}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t("photos_hint")}</p>
                <ImageUploader facilityId={facility.id} initialImages={initialImages} />
            </div>

            {/* Sports */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{t("sports_section")}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t("sports_hint")}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                    {allSports.map((sport) => (
                        <button
                            key={sport.id}
                            type="button"
                            onClick={() =>
                                setSportIds((prev) =>
                                    prev.includes(sport.id) ? prev.filter((i) => i !== sport.id) : [...prev, sport.id]
                                )
                            }
                            className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all text-left ${sportIds.includes(sport.id)
                                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                                    : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                                }`}
                        >
                            {sportName(sport.name)}
                        </button>
                    ))}
                </div>
                {sportsError && <p className="text-sm text-red-500 mb-2" role="alert">{sportsError}</p>}
                {sportsSaved && (
                    <p className="text-sm text-emerald-600 flex items-center gap-1 mb-2">
                        <CheckCircle className="h-4 w-4" /> {t("sports_saved")}
                    </p>
                )}
                <Button variant="primary" onClick={saveSports}>{t("save_sports")}</Button>
            </div>
        </div>
    );
}
