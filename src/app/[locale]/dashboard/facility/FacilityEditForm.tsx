"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { facilityUpdateSchema, type FacilityUpdateInput } from "@/lib/validations";
import { updateFacilityAction, updateFacilitySportsAction } from "../actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CheckCircle } from "lucide-react";

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
}

export function FacilityEditForm({ facility, allSports, currentSportIds }: Props) {
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
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5">Facility Details</h2>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input label="Facility name" error={errors.name?.message} {...register("name")} />
                        <Input label="City" error={errors.city?.message} {...register("city")} />
                    </div>
                    <Input label="Address" error={errors.address?.message} {...register("address")} />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Input label="Postal code" error={errors.postal_code?.message} {...register("postal_code")} />
                        <Input label="Phone" error={errors.phone?.message} {...register("phone")} />
                        <Input label="Website" placeholder="https://" error={errors.website?.message} {...register("website")} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                        <textarea
                            {...register("description")}
                            rows={4}
                            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            placeholder="Describe your facility (at least 20 characters)…"
                        />
                        {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description.message}</p>}
                    </div>

                    {serverError && <p className="text-sm text-red-500" role="alert">{serverError}</p>}
                    {saved && (
                        <p className="text-sm text-emerald-600 flex items-center gap-1">
                            <CheckCircle className="h-4 w-4" /> Saved successfully
                        </p>
                    )}
                    <Button type="submit" variant="primary" loading={isSubmitting}>Save Changes</Button>
                </form>
            </div>

            {/* Sports */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sports Offered</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Select all sports available at your facility.</p>
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
                            {sport.name}
                        </button>
                    ))}
                </div>
                {sportsError && <p className="text-sm text-red-500 mb-2" role="alert">{sportsError}</p>}
                {sportsSaved && (
                    <p className="text-sm text-emerald-600 flex items-center gap-1 mb-2">
                        <CheckCircle className="h-4 w-4" /> Sports updated
                    </p>
                )}
                <Button variant="primary" onClick={saveSports}>Save Sports</Button>
            </div>
        </div>
    );
}
