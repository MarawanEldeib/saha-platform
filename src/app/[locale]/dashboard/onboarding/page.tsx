"use client";

import React from "react";
import { useTranslations, useLocale } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { facilitySchema, type FacilityInput } from "@/lib/validations";
import { createClient } from "@/lib/supabase/client";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { CheckCircle, Building2 } from "lucide-react";
import { FOCUS_SPORTS, LAUNCH_COUNTRIES } from "@/lib/platform-config";

export default function OnboardingPage() {
    const t = useTranslations("dashboard.onboarding");
    const locale = useLocale();
    const router = useRouter();
    const [step, setStep] = React.useState(1);
    const [sportIds, setSportIds] = React.useState<number[]>([]);
    const [dbSports, setDbSports] = React.useState<{ id: number; name: string }[]>([]);
    const [serverError, setServerError] = React.useState<string | null>(null);
    const [facilityId, setFacilityId] = React.useState<string | null>(null);

    // Load sports from DB when entering Step 2
    React.useEffect(() => {
        if (step !== 2 || dbSports.length > 0) return;
        createClient()
            .from("sports")
            .select("id, name")
            .order("name")
            .then(({ data }) => {
                const sports = (data as { id: number; name: string }[]) ?? [];
                setDbSports(sports.filter((sport) => FOCUS_SPORTS.includes(sport.name as (typeof FOCUS_SPORTS)[number])));
            });
    }, [step, dbSports.length]);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<FacilityInput>({
        resolver: zodResolver(facilitySchema),
        defaultValues: {
            name: "", address: "", city: "", country: LAUNCH_COUNTRIES[0],
            description: "", phone: "", website: "",
        },
    });

    // Step 1: Basic facility info
    const submitStep1 = async (data: FacilityInput) => {
        setServerError(null);
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push(`/${locale}/login`); return; }

        const { data: facility, error } = await supabase
            .from("facilities")
            .insert({ ...data, owner_id: user.id, status: "pending" })
            .select("id")
            .single();

        if (error) { setServerError(error.message); return; }
        setFacilityId(facility.id);
        setStep(2);
    };

    // Step 2: Sports selection
    const submitStep2 = async () => {
        if (!facilityId) {
            setServerError("Missing facility context. Please restart onboarding.");
            return;
        }
        if (sportIds.length === 0) {
            setServerError("Please select at least one sport.");
            return;
        }
        setServerError(null);

        const supabase = createClient();

        // Insert selected known sports
        if (sportIds.length > 0) {
            const rows = sportIds.map((id) => ({ facility_id: facilityId, sport_id: id }));
            const { error } = await supabase.from("facility_sports").insert(rows);
            if (error) { setServerError(error.message); return; }
        }

        setStep(3);
    };

    // Step 3: Done — hard navigation bypasses Next.js Router Cache so the server
    // re-reads the newly inserted facility (router.push would serve stale RSC payload)
    const finish = () => {
        window.location.href = `/${locale}/dashboard`;
    };

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            {/* Step indicator */}
            <div className="flex items-center gap-3">
                {[1, 2, 3].map((s) => (
                    <React.Fragment key={s}>
                        <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${step >= s
                                ? "bg-emerald-600 border-emerald-600 text-white"
                                : "border-gray-300 dark:border-gray-700 text-gray-400"
                                }`}
                        >
                            {step > s ? "✓" : s}
                        </div>
                        {s < 3 && <div className={`flex-1 h-0.5 ${step > s ? "bg-emerald-500" : "bg-gray-200 dark:bg-gray-800"}`} />}
                    </React.Fragment>
                ))}
            </div>

            {/* Step 1: Facility Details */}
            {step === 1 && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <Building2 className="h-6 w-6 text-emerald-500" />
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t("step1_title")}</h1>
                    </div>
                    <form onSubmit={handleSubmit(submitStep1)} className="space-y-4">
                        <Input label="Facility Name *" error={errors.name?.message} {...register("name")} />
                        <Input label="Street Address *" error={errors.address?.message} {...register("address")} />
                        <div className="grid grid-cols-2 gap-4">
                            <Input label="City *" error={errors.city?.message} {...register("city")} />
                            <Input label="Postal Code" {...register("postal_code")} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Country *</label>
                            <select
                                {...register("country")}
                                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                                {LAUNCH_COUNTRIES.map((country) => (
                                    <option key={country} value={country}>
                                        {country}
                                    </option>
                                ))}
                            </select>
                            {errors.country && <p className="text-xs text-red-500 mt-1">{errors.country.message}</p>}
                        </div>
                        <Textarea label="Description" rows={3} {...register("description")} />
                        <div className="grid grid-cols-2 gap-4">
                            <Input label="Phone" type="tel" {...register("phone")} />
                            <Input label="Website" type="url" {...register("website")} />
                        </div>
                        {serverError && <p className="text-sm text-red-500" role="alert">{serverError}</p>}
                        <Button type="submit" variant="primary" loading={isSubmitting} className="w-full">
                            {t("next")}
                        </Button>
                    </form>
                </div>
            )}

            {/* Step 2: Sports Selection */}
            {step === 2 && (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t("step2_title")}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                        Select all that apply. We currently support padel, badminton, squash, and tennis.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                        {dbSports.map((sport) => (
                            <button
                                key={sport.id}
                                type="button"
                                onClick={() => setSportIds((prev) =>
                                    prev.includes(sport.id) ? prev.filter((i) => i !== sport.id) : [...prev, sport.id]
                                )}
                                className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all text-left ${sportIds.includes(sport.id)
                                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                                    : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                                    }`}
                            >
                                {sport.name}
                            </button>
                        ))}
                    </div>
                    {serverError && <p className="text-sm text-red-500 mb-3" role="alert">{serverError}</p>}
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={() => setStep(1)}>{t("back")}</Button>
                        <Button variant="primary" onClick={submitStep2}>{t("next")}</Button>
                    </div>
                </div>
            )}

            {/* Step 3: Success */}
            {step === 3 && (
                <div className="text-center bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8">
                    <CheckCircle className="mx-auto h-14 w-14 text-emerald-500 mb-4" />
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t("success_title")}</h2>
                    <p className="text-gray-500 dark:text-gray-400 mb-6">{t("success_desc")}</p>
                    <Button variant="primary" onClick={finish}>{t("go_dashboard")}</Button>
                </div>
            )}
        </div>
    );
}
