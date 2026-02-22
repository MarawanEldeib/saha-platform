"use client";

import React from "react";
import { useTranslations, useLocale } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validations";
import { resetPasswordAction } from "../actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function ResetPasswordPage() {
    const t = useTranslations("auth.reset_password");
    const locale = useLocale();
    const [serverError, setServerError] = React.useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) });

    const onSubmit = async (data: ResetPasswordInput) => {
        setServerError(null);
        const fd = new FormData();
        fd.append("password", data.password);
        fd.append("confirm_password", data.confirm_password);
        fd.append("locale", locale);
        const result = await resetPasswordAction(fd);
        if (result?.error) setServerError(result.error);
    };

    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 bg-gray-50 dark:bg-gray-950">
            <div className="w-full max-w-md">
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 p-8">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">{t("title")}</h1>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                        <Input label={t("new_password")} type="password" autoComplete="new-password" error={errors.password?.message} {...register("password")} />
                        <Input label={t("confirm_password")} type="password" autoComplete="new-password" error={errors.confirm_password?.message} {...register("confirm_password")} />
                        {serverError && <p className="text-sm text-red-500" role="alert">{serverError}</p>}
                        <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full">
                            {t("submit")}
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
}
