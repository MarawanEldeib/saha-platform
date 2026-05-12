"use client";

/**
 * SAH-152 Phase 4: pending join-request queue surfaced to the host on
 * /matches/[id] when the gate is 'request'.
 *
 * One-tap Accept / Decline buttons per request. On accept the requester
 * is seated as a participant (if capacity allows).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserCheck } from "lucide-react";
import Link from "next/link";
import { respondToJoinRequestAction } from "../actions";

interface JoinRequest {
    id: string;
    requester_user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    created_at: string;
}

interface Props {
    matchId: string;
    requests: JoinRequest[];
    locale: string;
}

function Avatar({ url, name }: { url: string | null; name: string }) {
    const initial = (name?.trim()[0] ?? "?").toUpperCase();
    if (url) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-9 w-9 rounded-full object-cover bg-gray-200" />
        );
    }
    return (
        <div className="h-9 w-9 rounded-full flex items-center justify-center font-semibold text-sm text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-200">
            {initial}
        </div>
    );
}

export function MatchJoinRequests({ matchId, requests, locale }: Props) {
    const t = useTranslations("match_detail");
    const router = useRouter();
    const [busyId, setBusyId] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    async function respond(requestId: string, decision: "accepted" | "declined") {
        setError(null);
        setBusyId(requestId);
        const result = await respondToJoinRequestAction(requestId, decision);
        setBusyId(null);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        router.refresh();
    }

    // matchId reserved for future analytics
    void matchId;

    return (
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6 mt-4">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                <UserCheck className="h-4 w-4" />
                {t("requests_heading", { count: requests.length })}
            </h2>

            {error && (
                <p className="text-sm text-red-600 dark:text-red-400 mb-3" role="alert">
                    {error}
                </p>
            )}

            <ul className="space-y-2">
                {requests.map((r) => (
                    <li
                        key={r.id}
                        className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 p-3"
                    >
                        <Avatar url={r.avatar_url} name={r.display_name ?? "?"} />
                        <Link
                            href={`/${locale}/players/${r.requester_user_id}`}
                            className="flex-1 text-sm font-medium text-gray-900 dark:text-white hover:text-emerald-600 truncate"
                        >
                            {r.display_name ?? t("anonymous_player")}
                        </Link>
                        <button
                            type="button"
                            onClick={() => respond(r.id, "accepted")}
                            disabled={busyId === r.id}
                            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-60"
                        >
                            {busyId === r.id ? "…" : t("accept_request")}
                        </button>
                        <button
                            type="button"
                            onClick={() => respond(r.id, "declined")}
                            disabled={busyId === r.id}
                            className="px-3 py-1 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60"
                        >
                            {t("decline_request")}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
