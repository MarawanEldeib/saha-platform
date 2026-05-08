"use client";

import React from "react";
import { updateProfileAction } from "../actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CheckCircle } from "lucide-react";
import { useTranslations } from "next-intl";

interface Props {
    initialName: string;
    initialPhone: string;
}

export function ProfileForm({ initialName, initialPhone }: Props) {
    const t = useTranslations("account");
    const [error, setError] = React.useState<string | null>(null);
    const [success, setSuccess] = React.useState(false);
    const [loading, setLoading] = React.useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);
        setLoading(true);
        const fd = new FormData(e.currentTarget);
        const result = await updateProfileAction(fd);
        setLoading(false);
        if (result?.error) { setError(result.error); return; }
        setSuccess(true);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
            <Input
                label={t("display_name")}
                name="display_name"
                defaultValue={initialName}
                required
            />
            <div className="space-y-1">
                <Input
                    label={t("phone_label")}
                    name="phone"
                    type="tel"
                    placeholder={t("phone_placeholder")}
                    defaultValue={initialPhone}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t("phone_hint")}
                </p>
            </div>
            {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
            {success && (
                <p className="text-sm text-emerald-600 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" /> {t("saved")}
                </p>
            )}
            <Button type="submit" variant="primary" loading={loading}>{t("save")}</Button>
        </form>
    );
}
