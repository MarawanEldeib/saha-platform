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
import { CheckCircle, ArrowLeft, AlertCircle, RefreshCcw } from "lucide-react";

/**
 * SAH-134: forgot-password UI with specific feedback for each outcome:
 *   - sent           → "Check your email" + Resend button (60s cooldown)
 *   - not_registered → "No Saha account uses this email" + Sign up link
 *   - rate_limited   → "Try again in Ns"
 *   - invalid_email  → inline form error
 *   - bot            → generic guard
 *   - error          → "Something went wrong"
 *
 * Resend uses the same server action; the existing auth_forgot rate limit
 * (3 / hour / IP) is the hard ceiling. The 60s client-side cooldown on
 * the button is a soft guard so users don't spam before the rate limit
 * kicks in and lock themselves out for an hour.
 */
export default function ForgotPasswordPage() {
    const t = useTranslations("auth.forgot_password");
    const locale = useLocale();

    const [phase, setPhase] = React.useState<
        | { status: "idle" }
        | { status: "sent"; email: string }
        | { status: "not_registered"; email: string }
        | { status: "rate_limited"; retryAfter: number }
        | { status: "error"; message: string }
    >({ status: "idle" });
    const [serverError, setServerError] = React.useState<string | null>(null);
    const [resending, setResending] = React.useState(false);
    const [cooldownSec, setCooldownSec] = React.useState(0);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

    // Tick the resend cooldown every second when active.
    React.useEffect(() => {
        if (cooldownSec <= 0) return;
        const id = setTimeout(() => setCooldownSec((s) => s - 1), 1000);
        return () => clearTimeout(id);
    }, [cooldownSec]);

    async function send(email: string): Promise<void> {
        const fd = new FormData();
        fd.append("email", email);
        fd.append("locale", locale);
        const result = await forgotPasswordAction(fd);
        if (result.ok) {
            setPhase({ status: "sent", email });
            setCooldownSec(60);
            return;
        }
        switch (result.code) {
            case "not_registered":
                setPhase({ status: "not_registered", email });
                return;
            case "rate_limited":
                setPhase({ status: "rate_limited", retryAfter: result.retryAfter });
                return;
            case "invalid_email":
                setServerError(result.message);
                return;
            case "bot":
                setServerError(t("bot_blocked"));
                return;
            case "error":
            default:
                setPhase({ status: "error", message: result.message });
        }
    }

    const onSubmit = async (data: ForgotPasswordInput) => {
        setServerError(null);
        await send(data.email);
    };

    const handleResend = async () => {
        if (phase.status !== "sent" || cooldownSec > 0) return;
        setResending(true);
        try {
            await send(phase.email);
        } finally {
            setResending(false);
        }
    };

    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 bg-gray-50 dark:bg-gray-950">
            <div className="w-full max-w-md">
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 p-8">
                    {phase.status === "sent" && (
                        <div className="text-center">
                            <CheckCircle className="mx-auto h-12 w-12 text-emerald-500 mb-4" />
                            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t("success")}</h1>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                                {t("success_detail", { email: phase.email })}
                            </p>
                            <button
                                type="button"
                                onClick={handleResend}
                                disabled={cooldownSec > 0 || resending}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <RefreshCcw className={`h-4 w-4 ${resending ? "animate-spin" : ""}`} />
                                {cooldownSec > 0
                                    ? t("resend_cooldown", { seconds: cooldownSec })
                                    : resending
                                        ? t("resending")
                                        : t("resend")}
                            </button>
                            <Link
                                href={`/${locale}/login`}
                                className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline flex items-center justify-center gap-1 mt-6"
                            >
                                <ArrowLeft className="h-4 w-4" /> {t("back_to_login")}
                            </Link>
                        </div>
                    )}

                    {phase.status === "not_registered" && (
                        <div className="text-center">
                            <AlertCircle className="mx-auto h-12 w-12 text-amber-500 mb-4" />
                            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t("not_registered_title")}</h1>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                                {t("not_registered_body", { email: phase.email })}
                            </p>
                            <div className="flex flex-col sm:flex-row gap-2 justify-center">
                                <Link
                                    href={`/${locale}/register`}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
                                >
                                    {t("create_account")}
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => setPhase({ status: "idle" })}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                >
                                    {t("try_another_email")}
                                </button>
                            </div>
                            <Link
                                href={`/${locale}/login`}
                                className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline flex items-center justify-center gap-1 mt-6"
                            >
                                <ArrowLeft className="h-4 w-4" /> {t("back_to_login")}
                            </Link>
                        </div>
                    )}

                    {phase.status === "rate_limited" && (
                        <div className="text-center">
                            <AlertCircle className="mx-auto h-12 w-12 text-amber-500 mb-4" />
                            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t("rate_limited_title")}</h1>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                                {t("rate_limited_body", { seconds: phase.retryAfter })}
                            </p>
                            <button
                                type="button"
                                onClick={() => setPhase({ status: "idle" })}
                                className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                            >
                                {t("back_to_form")}
                            </button>
                        </div>
                    )}

                    {phase.status === "error" && (
                        <div className="text-center">
                            <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
                            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t("error_title")}</h1>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{phase.message}</p>
                            <button
                                type="button"
                                onClick={() => setPhase({ status: "idle" })}
                                className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                            >
                                {t("try_again")}
                            </button>
                        </div>
                    )}

                    {phase.status === "idle" && (
                        <>
                            <div className="mb-8">
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
                                {serverError && (
                                    <p className="text-sm text-red-500" role="alert">
                                        {serverError}
                                    </p>
                                )}
                                <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full">
                                    {t("submit")}
                                </Button>
                            </form>
                            <Link
                                href={`/${locale}/login`}
                                className="mt-4 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                            >
                                <ArrowLeft className="h-4 w-4" /> {t("back_to_login")}
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
