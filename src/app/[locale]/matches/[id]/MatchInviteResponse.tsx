"use client";

/**
 * SAH-152 Phase 3: invite-response panel for the invited player.
 *
 * Shows when the viewer has a pending invite to this match. Accept seats
 * them as a participant; decline closes out the row.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { respondToMatchInviteAction } from "../actions";

interface Props {
    inviteId: string;
    matchId: string;
}

export function MatchInviteResponse({ inviteId, matchId }: Props) {
    const t = useTranslations("match_detail");
    const router = useRouter();
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    async function respond(decision: "accepted" | "declined") {
        setError(null);
        setBusy(true);
        const result = await respondToMatchInviteAction(inviteId, decision);
        setBusy(false);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        router.refresh();
    }

    // matchId reserved for analytics / future deep-link UX
    void matchId;

    return (
        <div className="rounded-2xl border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 p-5 mt-4">
            <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <Mail className="h-5 w-5" />
                </div>
                <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">{t("invite_heading")}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t("invite_subtitle")}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Button onClick={() => respond("accepted")} disabled={busy}>
                            {busy ? t("working") : t("accept_invite")}
                        </Button>
                        <Button variant="ghost" onClick={() => respond("declined")} disabled={busy}>
                            {t("decline_invite")}
                        </Button>
                    </div>
                    {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}
                </div>
            </div>
        </div>
    );
}
