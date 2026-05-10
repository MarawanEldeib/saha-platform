"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Eye, Trash2, X } from "lucide-react";
import { hideReviewAction, unhideReviewAction, adminDeleteReviewAction } from "../actions";

interface Props {
    reviewId: string;
    isHidden: boolean;
}

/**
 * SAH-130: per-row moderation buttons. Hide opens an inline reason input;
 * Delete requires a confirm step (irreversible).
 */
export function ReviewModerationActions({ reviewId, isHidden }: Props) {
    const router = useRouter();
    const [mode, setMode] = React.useState<"idle" | "hiding" | "confirming_delete">("idle");
    const [reason, setReason] = React.useState("");
    const [error, setError] = React.useState<string | null>(null);
    const [isPending, startTransition] = React.useTransition();

    const handleHide = () => {
        setError(null);
        startTransition(async () => {
            const result = await hideReviewAction(reviewId, reason);
            if (result?.error) {
                setError(result.error);
                return;
            }
            setMode("idle");
            setReason("");
            router.refresh();
        });
    };

    const handleUnhide = () => {
        setError(null);
        startTransition(async () => {
            const result = await unhideReviewAction(reviewId);
            if (result?.error) {
                setError(result.error);
                return;
            }
            router.refresh();
        });
    };

    const handleDelete = () => {
        setError(null);
        startTransition(async () => {
            const result = await adminDeleteReviewAction(reviewId);
            if (result?.error) {
                setError(result.error);
                setMode("idle");
                return;
            }
            router.refresh();
        });
    };

    const baseBtn = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors";
    const ghostBtn = "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800";
    const dangerBtn = "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30";

    if (mode === "hiding") {
        return (
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                />
                {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={handleHide}
                        disabled={isPending}
                        className={`${baseBtn} bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60`}
                    >
                        <EyeOff className="h-3.5 w-3.5" />
                        {isPending ? "Hiding…" : "Hide review"}
                    </button>
                    <button
                        type="button"
                        onClick={() => { setMode("idle"); setReason(""); setError(null); }}
                        disabled={isPending}
                        className={`${baseBtn} ${ghostBtn}`}
                    >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    if (mode === "confirming_delete") {
        return (
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                    Permanently delete this review? This cannot be undone.
                </p>
                {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isPending}
                        className={`${baseBtn} bg-red-600 text-white hover:bg-red-700 disabled:opacity-60`}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        {isPending ? "Deleting…" : "Yes, delete"}
                    </button>
                    <button
                        type="button"
                        onClick={() => { setMode("idle"); setError(null); }}
                        disabled={isPending}
                        className={`${baseBtn} ${ghostBtn}`}
                    >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex gap-2">
            {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
            {isHidden ? (
                <button
                    type="button"
                    onClick={handleUnhide}
                    disabled={isPending}
                    className={`${baseBtn} ${ghostBtn}`}
                >
                    <Eye className="h-3.5 w-3.5" />
                    {isPending ? "Unhiding…" : "Unhide"}
                </button>
            ) : (
                <button
                    type="button"
                    onClick={() => setMode("hiding")}
                    className={`${baseBtn} ${ghostBtn}`}
                >
                    <EyeOff className="h-3.5 w-3.5" />
                    Hide
                </button>
            )}
            <button
                type="button"
                onClick={() => setMode("confirming_delete")}
                className={`${baseBtn} ${dangerBtn}`}
            >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
            </button>
        </div>
    );
}
