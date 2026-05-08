"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { updateProfileAction, updateAvatarAction } from "../actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CheckCircle, Camera, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

interface Props {
    initialName: string;
    initialPhone: string;
    initialAvatar?: string | null;
}

async function cropToSquareJpeg(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
            const size = Math.min(img.width, img.height);
            const canvas = document.createElement("canvas");
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext("2d");
            if (!ctx) { reject(new Error("Canvas not available")); return; }
            ctx.drawImage(
                img,
                (img.width - size) / 2,
                (img.height - size) / 2,
                size, size,
                0, 0,
                256, 256,
            );
            URL.revokeObjectURL(objectUrl);
            canvas.toBlob(
                (blob) => (blob ? resolve(blob) : reject(new Error("Crop failed"))),
                "image/jpeg",
                0.9,
            );
        };
        img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Failed to load image")); };
        img.src = objectUrl;
    });
}

export function ProfileForm({ initialName, initialPhone, initialAvatar }: Props) {
    const t = useTranslations("account");
    const router = useRouter();

    const [error, setError] = React.useState<string | null>(null);
    const [success, setSuccess] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [avatarUrl, setAvatarUrl] = React.useState<string | null>(initialAvatar ?? null);
    const [uploading, setUploading] = React.useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleAvatarClick = () => fileInputRef.current?.click();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) { setError("Please select an image file."); return; }

        setUploading(true);
        setError(null);
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const blob = await cropToSquareJpeg(file);
            const path = `${user.id}/avatar.jpg`;

            const { error: uploadError } = await supabase.storage
                .from("avatars")
                .upload(path, blob, { contentType: "image/jpeg", upsert: true });
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);

            const result = await updateAvatarAction(publicUrl);
            if (result?.error) throw new Error(result.error);

            setAvatarUrl(`${publicUrl}?t=${Date.now()}`);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

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

    const initials = initialName
        ? initialName.trim().split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
        : "?";

    return (
        <div className="space-y-6 max-w-sm">
            {/* Avatar upload */}
            <div className="flex items-center gap-4">
                <button
                    type="button"
                    onClick={handleAvatarClick}
                    disabled={uploading}
                    className="relative group shrink-0 w-20 h-20 rounded-full overflow-hidden bg-emerald-100 dark:bg-emerald-900/30 border-2 border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 flex items-center justify-center"
                    aria-label={t("change_avatar")}
                >
                    {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 select-none">
                            {initials}
                        </span>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity flex items-center justify-center">
                        {uploading
                            ? <Loader2 className="h-5 w-5 text-white animate-spin" />
                            : <Camera className="h-5 w-5 text-white" />
                        }
                    </div>
                </button>
                <div>
                    <button
                        type="button"
                        onClick={handleAvatarClick}
                        disabled={uploading}
                        className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50"
                    >
                        {uploading ? t("uploading_avatar") : t("change_avatar")}
                    </button>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">JPEG, PNG or WebP</p>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                />
            </div>

            {/* Text fields */}
            <form onSubmit={handleSubmit} className="space-y-4">
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
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t("phone_hint")}</p>
                </div>
                {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
                {success && (
                    <p className="text-sm text-emerald-600 flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" /> {t("saved")}
                    </p>
                )}
                <Button type="submit" variant="primary" loading={loading}>{t("save")}</Button>
            </form>
        </div>
    );
}
