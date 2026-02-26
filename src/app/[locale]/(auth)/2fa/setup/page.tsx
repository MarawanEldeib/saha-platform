"use client";

import React from "react";
import { useTranslations, useLocale } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { totpCodeSchema, type TotpCodeInput } from "@/lib/validations";
import { enrollTotpAction, verifyTotpAction } from "../../actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ShieldCheck, AlertCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";

export default function TwoFASetupPage() {
    const t = useTranslations("auth.two_factor");
    const locale = useLocale();
    const searchParams = useSearchParams();
    const next = searchParams.get("next") ?? "";

    const [qrCode, setQrCode] = React.useState<string | null>(null);
    const [factorId, setFactorId] = React.useState<string | null>(null);
    const [serverError, setServerError] = React.useState<string | null>(null);
    const [enrolling, setEnrolling] = React.useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<TotpCodeInput>({ resolver: zodResolver(totpCodeSchema) });

    React.useEffect(() => {
        const enroll = async () => {
            setEnrolling(true);
            const result = await enrollTotpAction();
            if (result.error) {
                setServerError(result.error);
            } else if (result.data) {
                setQrCode(result.data.totp.qr_code);
                setFactorId(result.data.id);
            }
            setEnrolling(false);
        };
        enroll();
    }, []);

    const onSubmit = async (data: TotpCodeInput) => {
        if (!factorId) return;
        setServerError(null);
        const fd = new FormData();
        fd.append("code", data.code);
        fd.append("factor_id", factorId);
        fd.append("locale", locale);
        fd.append("next", next);
        const result = await verifyTotpAction(fd);
        if (result?.error) setServerError(result.error);
    };

    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 bg-gray-50 dark:bg-gray-950">
            <div className="w-full max-w-md">
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 p-8">
                    <div className="text-center mb-6">
                        <ShieldCheck className="mx-auto h-10 w-10 text-emerald-500 mb-3" />
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("setup_title")}</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("setup_subtitle")}</p>
                    </div>

                    {enrolling && (
                        <div className="flex justify-center py-8">
                            <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
                        </div>
                    )}

                    {qrCode && !enrolling && (
                        <div className="flex justify-center mb-6">
                            <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                                {/* QR code is a data URI SVG from Supabase */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={qrCode}
                                    alt="2FA QR Code"
                                    width={180}
                                    height={180}
                                />
                            </div>
                        </div>
                    )}

                    {serverError && (
                        <div className="flex items-center gap-2 text-sm text-red-500 mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg" role="alert">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            {serverError}
                        </div>
                    )}

                    {factorId && (
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                            <Input
                                label={t("code_label")}
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                placeholder="000000"
                                error={errors.code?.message}
                                {...register("code")}
                            />
                            <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full">
                                {isSubmitting ? t("loading") : t("submit")}
                            </Button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
