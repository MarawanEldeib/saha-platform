"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { reviewSchema, type ReviewInput } from "@/lib/validations";
import { createClient } from "@/lib/supabase/client";
import { StarRating } from "@/components/ui/StarRating";
import { Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";

interface ReviewFormProps {
    facilityId: string;
    locale: string;
}

export function ReviewForm({ facilityId, locale }: ReviewFormProps) {
    const t = useTranslations("facility");
    const router = useRouter();
    const [selectedRating, setSelectedRating] = React.useState(0);
    const [serverError, setServerError] = React.useState<string | null>(null);
    const [submitted, setSubmitted] = React.useState(false);

    const {
        register,
        handleSubmit,
        setValue,
        formState: { errors, isSubmitting },
    } = useForm<ReviewInput>({
        resolver: zodResolver(reviewSchema),
        defaultValues: { rating: 0 },
    });

    const onSubmit = async (data: ReviewInput) => {
        setServerError(null);
        const supabase = createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            router.push(`/${locale}/login`);
            return;
        }

        const { error } = await supabase.from("reviews").insert({
            facility_id: facilityId,
            user_id: user.id,
            rating: data.rating,
            comment: data.comment ?? null,
        });

        if (error) {
            if (error.code === "23505") {
                setServerError("You have already reviewed this facility.");
            } else {
                setServerError(error.message);
            }
            return;
        }

        setSubmitted(true);
        router.refresh();
    };

    if (submitted) {
        return (
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                <CheckCircle className="h-5 w-5 shrink-0" />
                <span>Review submitted successfully. Thank you!</span>
            </div>
        );
    }

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">{t("write_review")}</h3>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t("your_rating")}</label>
                    <StarRating
                        value={selectedRating}
                        onChange={(v) => {
                            setSelectedRating(v);
                            setValue("rating", v, { shouldValidate: true });
                        }}
                        size={24}
                    />
                    {errors.rating && (
                        <p className="text-xs text-red-500">Please select a rating.</p>
                    )}
                </div>

                <Textarea
                    label={t("your_comment")}
                    placeholder="Share your experience..."
                    error={errors.comment?.message}
                    {...register("comment")}
                />

                {serverError && (
                    <p className="text-sm text-red-500" role="alert">{serverError}</p>
                )}

                <Button type="submit" variant="primary" size="md" loading={isSubmitting}>
                    {t("submit_review")}
                </Button>
            </form>
        </div>
    );
}
