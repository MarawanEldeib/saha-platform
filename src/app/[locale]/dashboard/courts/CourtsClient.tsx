"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { courtSchema, type CourtInput } from "@/lib/validations";
import {
    createCourtAction,
    updateCourtAction,
    toggleCourtActiveAction,
    deleteCourtAction,
} from "../actions";
import { Pencil, Trash2, Plus, X, CheckCircle, XCircle } from "lucide-react";
import type { Sport } from "@/types/database";
import { useTranslations, useLocale } from "next-intl";
import { formatPrice } from "@/lib/utils";

type CourtRow = {
    id: string;
    facility_id: string;
    sport_id: number | null;
    name: string;
    capacity: number;
    price_per_hour: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    sports: { id: number; name: string; icon: string | null } | null;
};

type Props = {
    courts: CourtRow[];
    sports: Sport[];
    facilityId: string;
    currency?: string;
};

export function CourtsClient({ courts, sports, facilityId, currency = "AED" }: Props) {
    const t = useTranslations("courts");
    const tSports = useTranslations("sports");
    const locale = useLocale();
    const router = useRouter();
    const knownSports = ["Padel", "Pickleball", "Tennis", "Squash", "Badminton"] as const;
    const sportName = (name: string) =>
        knownSports.includes(name as typeof knownSports[number]) ? tSports(name as typeof knownSports[number]) : name;
    const [editingCourt, setEditingCourt] = useState<CourtRow | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const { register, handleSubmit, reset, formState: { errors } } = useForm<CourtInput>({
        resolver: zodResolver(courtSchema),
        defaultValues: { name: "", sport_id: "", capacity: 2, price_per_hour: 50 },
    });

    function openAddForm() {
        setEditingCourt(null);
        reset({ name: "", sport_id: "", capacity: 2, price_per_hour: 50 });
        setServerError(null);
        setShowForm(true);
    }

    function openEditForm(court: CourtRow) {
        setEditingCourt(court);
        reset({
            name: court.name,
            sport_id: court.sport_id ? String(court.sport_id) : "",
            capacity: court.capacity,
            price_per_hour: Number(court.price_per_hour),
        });
        setServerError(null);
        setShowForm(true);
    }

    function closeForm() {
        setEditingCourt(null);
        setShowForm(false);
        reset();
        setServerError(null);
    }

    const onSubmit = (data: CourtInput) => {
        startTransition(async () => {
            const result = editingCourt
                ? await updateCourtAction(editingCourt.id, data)
                : await createCourtAction(facilityId, data);

            if (result.error) { setServerError(result.error); return; }
            router.refresh();
            closeForm();
        });
    };

    const handleToggle = (court: CourtRow) => {
        startTransition(async () => {
            const result = await toggleCourtActiveAction(court.id, !court.is_active);
            if (!result.error) router.refresh();
        });
    };

    const handleDelete = (court: CourtRow) => {
        if (!confirm(t("delete_confirm", { name: court.name }))) return;
        startTransition(async () => {
            const result = await deleteCourtAction(court.id);
            if (result.error) alert(result.error);
            else router.refresh();
        });
    };

    return (
        <div className="space-y-6">
            {courts.length === 0 && !showForm ? (
                <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
                    <p className="text-gray-500 dark:text-gray-400 mb-4">{t("no_courts")}</p>
                    <button
                        onClick={openAddForm}
                        className="inline-flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 font-medium px-5 py-2.5 rounded-xl text-sm transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                        {t("add_first")}
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {courts.length} {courts.length !== 1 ? t("court_plural") : t("court_singular")}
                        </p>
                        {!showForm && (
                            <button
                                onClick={openAddForm}
                                className="inline-flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 font-medium px-4 py-2 rounded-xl text-sm transition-colors"
                            >
                                <Plus className="h-4 w-4" />
                                {t("add_court")}
                            </button>
                        )}
                    </div>

                    <div className="divide-y divide-gray-200 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                        {courts.map((court) => (
                            <div
                                key={court.id}
                                className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                            >
                                <div className="min-w-0">
                                    <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                                        {court.name}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                        {court.sports?.name ? sportName(court.sports.name) : t("no_sport")} &middot; {court.capacity} {t("players")} &middot; {formatPrice(court.price_per_hour, currency, locale)}/hr
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 ml-4 shrink-0">
                                    <span className={`hidden sm:inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                                        court.is_active
                                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                                    }`}>
                                        {court.is_active
                                            ? <CheckCircle className="h-3 w-3" />
                                            : <XCircle className="h-3 w-3" />}
                                        {court.is_active ? t("active") : t("inactive")}
                                    </span>

                                    <button
                                        onClick={() => openEditForm(court)}
                                        className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                                        title={t("edit_aria")}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </button>

                                    <button
                                        onClick={() => handleToggle(court)}
                                        disabled={isPending}
                                        className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors disabled:opacity-50"
                                        title={court.is_active ? t("deactivate_aria") : t("activate_aria")}
                                    >
                                        {court.is_active
                                            ? <XCircle className="h-4 w-4" />
                                            : <CheckCircle className="h-4 w-4" />}
                                    </button>

                                    <button
                                        onClick={() => handleDelete(court)}
                                        disabled={isPending}
                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                                        title={t("delete_aria")}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {showForm && (
                <div className="border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                            {editingCourt ? `${t("edit_aria")} "${editingCourt.name}"` : t("form_heading")}
                        </h2>
                        <button
                            onClick={closeForm}
                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="sm:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t("name_label")}
                                </label>
                                <input
                                    {...register("name")}
                                    placeholder={t("name_placeholder")}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                />
                                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t("sport_label")}
                                </label>
                                <select
                                    {...register("sport_id")}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                >
                                    <option value="">{t("no_specific_sport")}</option>
                                    {sports.map((s) => (
                                        <option key={s.id} value={String(s.id)}>{sportName(s.name)}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t("capacity_label")}
                                </label>
                                <input
                                    {...register("capacity", { valueAsNumber: true })}
                                    type="number"
                                    min="1"
                                    max="50"
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                />
                                {errors.capacity && <p className="mt-1 text-xs text-red-500">{errors.capacity.message}</p>}
                            </div>

                            <div className="sm:col-span-2 sm:max-w-xs">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t("price_label")}
                                </label>
                                <div className="relative">
                                    <span className="absolute start-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
                                        {t("price_prefix")}
                                    </span>
                                    <input
                                        {...register("price_per_hour", { valueAsNumber: true })}
                                        type="number"
                                        min="0"
                                        step="1"
                                        className="w-full ps-12 pe-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    />
                                </div>
                                {errors.price_per_hour && <p className="mt-1 text-xs text-red-500">{errors.price_per_hour.message}</p>}
                            </div>
                        </div>

                        {serverError && <p className="text-sm text-red-500">{serverError}</p>}

                        <div className="flex gap-3 pt-2">
                            <button
                                type="submit"
                                disabled={isPending}
                                className="inline-flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 font-medium px-5 py-2 rounded-xl text-sm transition-colors"
                            >
                                {isPending ? t("saving") : editingCourt ? t("save_changes") : t("add_court")}
                            </button>
                            <button
                                type="button"
                                onClick={closeForm}
                                className="px-5 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium rounded-xl text-sm transition-colors"
                            >
                                {t("cancel")}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
