"use client";

/**
 * SAH-152 Phase 2: Join / Leave / Cancel control panel on /matches/[id].
 *
 * Branches by viewer role: anonymous → sign-in CTA, host → cancel button,
 * already-joined → leave, otherwise → join (open gate) or a gated message
 * for request / invite_only (those flows ship in Phase 4).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { joinMatchAction, leaveMatchAction, cancelMatchAction } from "../actions";

interface Props {
    matchId: string;
    matchStatus: "open" | "live" | "completed" | "cancelled";
    matchGate: "open" | "request" | "invite_only";
    isHost: boolean;
    isParticipant: boolean;
    isAuthenticated: boolean;
    locale: string;
    isFull: boolean;
}

export function JoinLeaveControls({
    matchId, matchStatus, matchGate, isHost, isParticipant, isAuthenticated, locale, isFull,
}: Props) {
    const t = useTranslations("match_detail");
    const router = useRouter();
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, confirmKey?: string) {
        setError(null);
        if (confirmKey && !window.confirm(t(confirmKey))) return;
        setBusy(true);
        const result = await fn();
        setBusy(false);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        router.refresh();
    }

    if (matchStatus === "cancelled") {
        return <p className="text-sm text-red-600 dark:text-red-400">{t("status.cancelled_explain")}</p>;
    }
    if (matchStatus === "completed") {
        return <p className="text-sm text-gray-500 dark:text-gray-400">{t("status.completed_explain")}</p>;
    }

    if (!isAuthenticated) {
        return (
            <Link
                href={`/${locale}/login?next=/${locale}/matches/${matchId}`}
                className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm"
            >
                {t("sign_in_to_join")}
            </Link>
        );
    }

    if (isHost) {
        return (
            <div className="flex items-center gap-3">
                <Button
                    variant="danger"
                    onClick={() => run(() => cancelMatchAction(matchId), "confirm_cancel")}
                    disabled={busy}
                >
                    {busy ? t("working") : t("cancel_match")}
                </Button>
                {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
            </div>
        );
    }

    if (isParticipant) {
        return (
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    onClick={() => run(() => leaveMatchAction(matchId), "confirm_leave")}
                    disabled={busy}
                >
                    {busy ? t("working") : t("leave_match")}
                </Button>
                {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
            </div>
        );
    }

    if (matchGate === "open") {
        return (
            <div className="flex items-center gap-3">
                <Button
                    onClick={() => run(() => joinMatchAction(matchId))}
                    disabled={busy || isFull}
                >
                    {busy ? t("working") : isFull ? t("full") : t("join_match")}
                </Button>
                {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
            </div>
        );
    }

    return (
        <p className="text-sm text-gray-500 dark:text-gray-400">
            {matchGate === "request" ? t("gate.request_blurb") : t("gate.invite_only_blurb")}
        </p>
    );
}
