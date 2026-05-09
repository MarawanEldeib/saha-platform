"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { StarRating } from "@/components/ui/StarRating";
import { createClient } from "@/lib/supabase/client";

type Props = {
    bookingId: string;
    facilityId: string;
    locale: string;
};

export function QuickReviewForm({ facilityId, locale }: Props) {
    const t = useTranslations("quick_review");
    const router = useRouter();
    const pathname = usePathname();
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState("");
    const [showComment, setShowComment] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (rating === 0) {
            setError(t("rating_required"));
            return;
        }
        if (comment.length > 0 && comment.length < 10) {
            setError(t("comment_too_short"));
            return;
        }
        setError(null);

        startTransition(async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push(`/${locale}/login?next=${pathname}`);
                return;
            }

            const { error: insertError } = await supabase.from("reviews").insert({
                facility_id: facilityId,
                user_id: user.id,
                rating,
                comment: comment.trim() === "" ? null : comment.trim(),
            });

            if (insertError) {
                if (insertError.code === "23505") setError(t("already_reviewed"));
                else if (insertError.code === "42501") setError(t("rls_blocked"));
                else setError(insertError.message);
                return;
            }

            router.push(`${pathname}?done=1`);
        });
    }

    return (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 space-y-5">
            <div className="text-center space-y-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("rate_prompt")}</p>
                <div className="flex justify-center">
                    <StarRating value={rating} onChange={setRating} size={40} />
                </div>
            </div>

            {!showComment ? (
                <button
                    type="button"
                    onClick={() => setShowComment(true)}
                    className="block w-full text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                    {t("add_comment_optional")}
                </button>
            ) : (
                <div>
                    <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        rows={3}
                        placeholder={t("comment_placeholder")}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">{t("comment_hint")}</p>
                </div>
            )}

            {error && <p className="text-sm text-red-500 text-center" role="alert">{error}</p>}

            <button
                type="submit"
                disabled={pending || rating === 0}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {pending ? t("submitting") : t("submit")}
            </button>
        </form>
    );
}
