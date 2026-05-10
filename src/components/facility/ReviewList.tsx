"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { Pencil, Trash2, X } from "lucide-react";
import { StarRating } from "@/components/ui/StarRating";
import { Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

/**
 * SAH-124: review list with inline edit + delete for the author.
 *
 * RLS already enforces ownership (`reviews_update_own`, `reviews_delete_own`),
 * so we use the browser Supabase client directly — same pattern as
 * `ReviewForm`. No server action needed; the database is the boundary.
 *
 * The page (server component) passes `currentUserId` so we know which row
 * the user can edit. When `currentUserId` is null (anonymous viewer), all
 * reviews render read-only.
 */

export interface ReviewListItem {
    id: string;
    user_id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    profiles: { display_name: string | null } | null;
}

interface Props {
    reviews: ReviewListItem[];
    currentUserId: string | null;
}

export function ReviewList({ reviews, currentUserId }: Props) {
    if (reviews.length === 0) return null;
    return (
        <div className="space-y-4 mb-6">
            {reviews.map((r) => (
                <ReviewItem key={r.id} review={r} isOwner={r.user_id === currentUserId} />
            ))}
        </div>
    );
}

function ReviewItem({ review, isOwner }: { review: ReviewListItem; isOwner: boolean }) {
    const t = useTranslations("facility");
    const router = useRouter();
    const [editing, setEditing] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [rating, setRating] = useState(review.rating);
    const [comment, setComment] = useState(review.comment ?? "");
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const cancelEdit = () => {
        setEditing(false);
        setRating(review.rating);
        setComment(review.comment ?? "");
        setError(null);
    };

    const handleSave = () => {
        setError(null);
        if (rating < 1 || rating > 5) {
            setError(t("review_rating_required"));
            return;
        }
        startTransition(async () => {
            const supabase = createClient();
            const { error: dbErr } = await supabase
                .from("reviews")
                .update({ rating, comment: comment.trim() || null })
                .eq("id", review.id);
            if (dbErr) {
                setError(dbErr.message);
                return;
            }
            setEditing(false);
            router.refresh();
        });
    };

    const handleDelete = () => {
        setError(null);
        startTransition(async () => {
            const supabase = createClient();
            const { error: dbErr } = await supabase
                .from("reviews")
                .delete()
                .eq("id", review.id);
            if (dbErr) {
                setError(dbErr.message);
                setConfirmingDelete(false);
                return;
            }
            router.refresh();
        });
    };

    const baseBtn =
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors";
    const enabledBtn =
        "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700";
    const dangerBtn =
        "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30";

    if (editing) {
        return (
            <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-800 rounded-xl space-y-3">
                <StarRating value={rating} onChange={setRating} size={20} />
                <Textarea
                    label={t("your_comment")}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Share your experience..."
                />
                {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
                <div className="flex gap-2">
                    <Button type="button" variant="primary" size="sm" loading={isPending} onClick={handleSave}>
                        {t("review_save")}
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={cancelEdit}>
                        {t("review_cancel")}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                    <StarRating value={review.rating} readOnly size={14} />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        {review.profiles?.display_name ?? "Anonymous"} · {format(new Date(review.created_at), "PP")}
                    </span>
                </div>
                {isOwner && !confirmingDelete && (
                    <div className="flex gap-1">
                        <button
                            type="button"
                            onClick={() => setEditing(true)}
                            title={t("review_edit")}
                            className={`${baseBtn} ${enabledBtn}`}
                        >
                            <Pencil className="h-3 w-3" />
                            {t("review_edit")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmingDelete(true)}
                            title={t("review_delete")}
                            className={`${baseBtn} ${dangerBtn}`}
                        >
                            <Trash2 className="h-3 w-3" />
                            {t("review_delete")}
                        </button>
                    </div>
                )}
            </div>
            {review.comment && (
                <p className="text-sm text-gray-700 dark:text-gray-300">{review.comment}</p>
            )}
            {error && <p className="text-sm text-red-500 mt-2" role="alert">{error}</p>}
            {confirmingDelete && (
                <div className="mt-3 flex flex-col gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                        {t("review_confirm_delete")}
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={isPending}
                            className={`${baseBtn} bg-red-600 text-white hover:bg-red-700 disabled:opacity-60`}
                        >
                            <Trash2 className="h-3 w-3" />
                            {isPending ? t("review_deleting") : t("review_confirm_delete_yes")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmingDelete(false)}
                            disabled={isPending}
                            className={`${baseBtn} ${enabledBtn}`}
                        >
                            <X className="h-3 w-3" />
                            {t("review_cancel")}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
