"use client";

import React, { Suspense } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@/lib/validations";
import { registerAction } from "../actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { MapPin, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

function RegisterForm() {
    const t = useTranslations("auth.register");
    const locale = useLocale();
    const searchParams = useSearchParams();
    const initialRole = searchParams.get("role") === "business" ? "business" : "user";
    const [serverError, setServerError] = React.useState<string | null>(null);
    const [success, setSuccess] = React.useState(false);

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        formState: { errors, isSubmitting },
    } = useForm<RegisterInput>({
        resolver: zodResolver(registerSchema),
        defaultValues: { role: initialRole },
    });

    const selectedRole = watch("role");

    const onSubmit = async (data: RegisterInput) => {
        setServerError(null);
        const fd = new FormData();
        Object.entries(data).forEach(([k, v]) => fd.append(k, v));
        fd.append("locale", locale);
        const result = await registerAction(fd);
        if (result?.error) setServerError(result.error);
        if (result?.success) setSuccess(true);
    };

    if (success) {
        return (
            <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 bg-gray-50 dark:bg-gray-950">
                <div className="text-center max-w-md">
                    <CheckCircle className="mx-auto h-12 w-12 text-emerald-500 mb-4" />
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t("success")}</h1>
                    <p className="text-gray-500 dark:text-gray-400">
                        {t("already_account")}{" "}
                        <Link href={`/${locale}/login`} className="text-emerald-600 hover:underline">
                            {t("login_link")}
                        </Link>
                    </p>
                </div>
            </div>
        );
    }

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
                        {/* Account Type Selector */}
                        <div className="space-y-1.5">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("account_type")}</p>
                            <div className="grid grid-cols-2 gap-3">
                                {(["user", "business"] as const).map((role) => (
                                    <button
                                        key={role}
                                        type="button"
                                        onClick={() => setValue("role", role)}
                                        className={cn(
                                            "py-3 px-4 rounded-xl border-2 text-sm font-medium text-left transition-all",
                                            selectedRole === role
                                                ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                                                : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                                        )}
                                    >
                                        {role === "user" ? t("type_user") : t("type_business")}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <Input label={t("name")} type="text" autoComplete="name" error={errors.display_name?.message} {...register("display_name")} />
                        <Input label={t("email")} type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
                        <Input label={t("password")} type="password" autoComplete="new-password" error={errors.password?.message} {...register("password")} />
                        <Input label={t("confirm_password")} type="password" autoComplete="new-password" error={errors.confirm_password?.message} {...register("confirm_password")} />

                        {serverError && (
                            <p className="text-sm text-red-500 text-center" role="alert">{serverError}</p>
                        )}

                        <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full mt-2">
                            {isSubmitting ? t("loading") : t("submit")}
                        </Button>
                    </form>

                    <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
                        {t("already_account")}{" "}
                        <Link href={`/${locale}/login`} className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline">
                            {t("login_link")}
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function RegisterPage() {
    return (
        <Suspense>
            <RegisterForm />
        </Suspense>
    );
}
