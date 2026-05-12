"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
    updateProfileAction,
    updateAvatarAction,
    removeAvatarAction,
    startPhoneVerificationAction,
    checkPhoneVerificationAction,
} from "../actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CheckCircle, Camera, Loader2, ShieldCheck, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

interface Props {
    initialName: string;
    initialPhone: string;
    initialAvatar?: string | null;
    /** SAH-79: drives the verify badge + skip-OTP logic when phone is unchanged. */
    initialPhoneVerified?: boolean;
    /** SAH-90: optional 15-digit UAE TRN to print on tax invoices. */
    initialTrn?: string;
    /** SAH-152 Phase 8: optional self-rated skill (1.0–7.0). */
    initialSkillRating?: number | null;
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

export function ProfileForm({ initialName, initialPhone, initialAvatar, initialPhoneVerified = false, initialTrn = "", initialSkillRating = null }: Props) {
    const t = useTranslations("account");
    const router = useRouter();

    const [error, setError] = React.useState<string | null>(null);
    const [success, setSuccess] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [avatarUrl, setAvatarUrl] = React.useState<string | null>(initialAvatar ?? null);
    const [uploading, setUploading] = React.useState(false);
    const [removing, setRemoving] = React.useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // SAH-79 verify state.
    const [displayName, setDisplayName] = React.useState(initialName);
    const [phone, setPhone] = React.useState(initialPhone);
    // SAH-90: optional player TRN.
    const [trn, setTrn] = React.useState(initialTrn);
    // SAH-152 Phase 8: skill rating self-rating.
    const [skillRating, setSkillRating] = React.useState<string>(
        initialSkillRating != null ? String(initialSkillRating.toFixed(2)) : "",
    );
    const [verifyStage, setVerifyStage] = React.useState<"idle" | "code-sent">("idle");
    const [otpCode, setOtpCode] = React.useState("");
    const [verifyLoading, setVerifyLoading] = React.useState(false);
    const [verifyError, setVerifyError] = React.useState<string | null>(null);
    const [verifyConfigured, setVerifyConfigured] = React.useState(true);

    const phoneChanged = phone.trim() !== initialPhone.trim();
    const phoneCleared = phoneChanged && phone.trim() === "";
    const phoneSetToNew = phoneChanged && phone.trim() !== "";

    const handleAvatarClick = () => fileInputRef.current?.click();

    const handleRemoveAvatar = async () => {
        setRemoving(true);
        setError(null);
        try {
            const result = await removeAvatarAction();
            if (result?.error) throw new Error(result.error);
            setAvatarUrl(null);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Remove failed");
        } finally {
            setRemoving(false);
        }
    };

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

    // ----- Phone verify flow (SAH-79) ---------------------------------------

    const handleSendCode = async () => {
        setVerifyError(null);
        setVerifyLoading(true);
        try {
            const res = await startPhoneVerificationAction(phone.trim());
            if ("notConfigured" in res && res.notConfigured) {
                setVerifyConfigured(false);
                setVerifyError("Phone verification isn't configured on this environment.");
                return;
            }
            if (res?.error) { setVerifyError(res.error); return; }
            setVerifyStage("code-sent");
        } finally {
            setVerifyLoading(false);
        }
    };

    const handleConfirmCode = async () => {
        setVerifyError(null);
        setVerifyLoading(true);
        try {
            const res = await checkPhoneVerificationAction(phone.trim(), otpCode.trim());
            if ("notConfigured" in res && res.notConfigured) {
                setVerifyConfigured(false);
                setVerifyError("Phone verification isn't configured on this environment.");
                return;
            }
            if (res?.error) { setVerifyError(res.error); return; }
            // Success — phone is persisted server-side.
            setVerifyStage("idle");
            setOtpCode("");
            setSuccess(true);
            router.refresh();
        } finally {
            setVerifyLoading(false);
        }
    };

    // ----- Profile (display_name + optional phone-clear) save ----------------

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);

        // Phone-set-to-new requires the verify flow — refuse to submit it here.
        if (phoneSetToNew) {
            setError("Verify the new phone number via WhatsApp first.");
            return;
        }

        setLoading(true);
        const fd = new FormData();
        fd.set("display_name", displayName);
        fd.set("phone", phoneCleared ? "" : initialPhone);
        fd.set("trn", trn.trim());
        fd.set("skill_rating", skillRating.trim());
        const result = await updateProfileAction(fd);
        setLoading(false);
        if (result?.error) { setError(result.error); return; }
        setSuccess(true);
        router.refresh();
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
                        disabled={uploading || removing}
                        className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50"
                    >
                        {uploading ? t("uploading_avatar") : t("change_avatar")}
                    </button>
                    {avatarUrl && (
                        <button
                            type="button"
                            onClick={handleRemoveAvatar}
                            disabled={uploading || removing}
                            className="block text-xs text-red-500 hover:text-red-600 dark:hover:text-red-400 mt-1 disabled:opacity-50"
                        >
                            {removing ? "Removing…" : "Remove photo"}
                        </button>
                    )}
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
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                />

                {/* Phone + verify state machine */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label htmlFor="phone-input" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {t("phone_label")}
                        </label>
                        {!phoneChanged && initialPhone && initialPhoneVerified && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                <ShieldCheck className="h-3.5 w-3.5" /> Verified
                            </span>
                        )}
                        {!phoneChanged && initialPhone && !initialPhoneVerified && (
                            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Not verified</span>
                        )}
                    </div>
                    <input
                        id="phone-input"
                        name="phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => { setPhone(e.target.value); setVerifyStage("idle"); setVerifyError(null); }}
                        placeholder={t("phone_placeholder")}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t("phone_hint")}</p>

                    {phoneSetToNew && verifyStage === "idle" && (
                        <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5 text-xs space-y-2">
                            <p className="text-amber-700 dark:text-amber-400">
                                We&apos;ll send a 6-digit code to <span className="font-mono">{phone.trim()}</span> on WhatsApp. The number isn&apos;t saved until you confirm the code.
                            </p>
                            {verifyError && <p className="text-red-600 dark:text-red-400">{verifyError}</p>}
                            <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                onClick={handleSendCode}
                                loading={verifyLoading}
                                disabled={!verifyConfigured}
                            >
                                <MessageCircle className="h-3.5 w-3.5 me-1.5" />
                                Send WhatsApp code
                            </Button>
                        </div>
                    )}

                    {phoneSetToNew && verifyStage === "code-sent" && (
                        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2.5 text-xs space-y-2">
                            <p className="text-emerald-700 dark:text-emerald-400">
                                Code sent to <span className="font-mono">{phone.trim()}</span>. Check WhatsApp.
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    value={otpCode}
                                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                                    placeholder="6-digit code"
                                    className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono tracking-widest"
                                />
                                <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    onClick={handleConfirmCode}
                                    loading={verifyLoading}
                                    disabled={otpCode.length < 4}
                                >
                                    Confirm
                                </Button>
                            </div>
                            {verifyError && <p className="text-red-600 dark:text-red-400">{verifyError}</p>}
                            <button
                                type="button"
                                onClick={handleSendCode}
                                disabled={verifyLoading}
                                className="text-xs text-gray-600 dark:text-gray-400 hover:underline disabled:opacity-50"
                            >
                                Resend code
                            </button>
                        </div>
                    )}
                </div>

                {/* SAH-152 Phase 8: skill rating self-rating */}
                <div className="space-y-1">
                    <label htmlFor="skill-rating-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Skill rating (optional)
                    </label>
                    <input
                        id="skill-rating-input"
                        name="skill_rating"
                        type="number"
                        min={1}
                        max={7}
                        step={0.1}
                        value={skillRating}
                        onChange={(e) => setSkillRating(e.target.value)}
                        placeholder="e.g. 3.5"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        1.0–7.0 padel-ladder scale. Shown to players when inviting you to a match.
                    </p>
                </div>

                {/* SAH-90: optional player TRN for tax-invoice corporate expenses */}
                <div className="space-y-1">
                    <label htmlFor="trn-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        TRN (optional)
                    </label>
                    <input
                        id="trn-input"
                        name="trn"
                        type="text"
                        inputMode="numeric"
                        maxLength={15}
                        value={trn}
                        onChange={(e) => setTrn(e.target.value.replace(/\D/g, "").slice(0, 15))}
                        placeholder="100123456789012"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        15-digit UAE Tax Registration Number. Prints on your booking tax invoices for corporate expensing.
                    </p>
                </div>

                {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
                {success && (
                    <p className="text-sm text-emerald-600 flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" /> {t("saved")}
                    </p>
                )}
                <Button type="submit" variant="primary" loading={loading} disabled={phoneSetToNew}>
                    {t("save")}
                </Button>
            </form>
        </div>
    );
}
