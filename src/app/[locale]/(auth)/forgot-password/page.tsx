"use client";

import React from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validations";
import { forgotPasswordAction } from "../actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CheckCircle, ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
    const t = useTranslations("auth.forgot_password");
    const locale = useLocale();
    const [success, setSuccess] = React.useState(false);
    const [serverError, setServerError] = React.useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

    const onSubmit = async (data: ForgotPasswordInput) => {
        setServerError(null);
        const fd = new FormData();
        fd.append("email", data.email);
        fd.append("locale", locale);
        const result = await forgotPasswordAction(fd);
        if (result?.error) setServerError(result.error);
        if (result?.success) setSuccess(true);
    };

    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 bg-gray-50 dark:bg-gray-950">
            <div className="w-full max-w-md">
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 p-8">
                    {success ? (
                        <div className="text-center">
                            <CheckCircle className="mx-auto h-12 w-12 text-emerald-500 mb-4" />
                            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t("success")}</h1>
                            <Link href={`/${locale}/login`} className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline flex items-center justify-center gap-1 mt-4">
                                <ArrowLeft className="h-4 w-4" /> {t("back_to_login")}
                            </Link>
                        </div>
                    ) : (
                        <>
                            <div className="mb-8">
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("title")}</h1>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("subtitle")}</p>
                            </div>
                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                                <Input label={t("email")} type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
                                {serverError && <p className="text-sm text-red-500" role="alert">{serverError}</p>}
                                <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full">
                                    {t("submit")}
                                </Button>
                            </form>
                            <Link href={`/${locale}/login`} className="mt-4 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                                <ArrowLeft className="h-4 w-4" /> {t("back_to_login")}
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
