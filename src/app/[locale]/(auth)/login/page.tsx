"use client";

import React from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validations";
import { loginAction } from "../actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { MapPin } from "lucide-react";

export default function LoginPage() {
    const t = useTranslations("auth.login");
    const locale = useLocale();
    const searchParams = useSearchParams();
    const next = searchParams.get("next") ?? "";

    const [serverError, setServerError] = React.useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

    const onSubmit = async (data: LoginInput) => {
        setServerError(null);
        const fd = new FormData();
        fd.append("email", data.email);
        fd.append("password", data.password);
        fd.append("locale", locale);
        fd.append("next", next);
        const result = await loginAction(fd);
        if (result?.error) setServerError(result.error);
    };

    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 bg-gray-50 dark:bg-gray-950">
            <div className="w-full max-w-md">
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 p-8">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl mb-4">
                            <MapPin className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("title")}</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("subtitle")}</p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                        <Input
                            label={t("email")}
                            type="email"
                            autoComplete="email"
                            error={errors.email?.message}
                            {...register("email")}
                        />
                        <Input
                            label={t("password")}
                            type="password"
                            autoComplete="current-password"
                            error={errors.password?.message}
                            {...register("password")}
                        />

                        {serverError && (
                            <p className="text-sm text-red-500 text-center" role="alert">
                                {serverError}
                            </p>
                        )}

                        <Button
                            type="submit"
                            variant="primary"
                            size="lg"
                            loading={isSubmitting}
                            className="w-full mt-2"
                        >
                            {isSubmitting ? t("loading") : t("submit")}
                        </Button>
                    </form>

                    <div className="mt-6 text-center space-y-3">
                        <Link
                            href={`/${locale}/forgot-password`}
                            className="block text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                        >
                            {t("forgot_password")}
                        </Link>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {t("no_account")}{" "}
                            <Link
                                href={`/${locale}/register`}
                                className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
                            >
                                {t("sign_up_link")}
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
