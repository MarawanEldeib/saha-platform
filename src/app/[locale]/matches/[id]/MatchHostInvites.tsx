"use client";

/**
 * SAH-152 Phase 3: invite panel surfaced to the match host on /matches/[id].
 *
 * Renders the "Invite players" button + the bottom-sheet modal, plus a
 * compact roll-up of the current invite states (pending / accepted /
 * declined) so the host can see who's been invited at a glance.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InvitePlayersSheet } from "./InvitePlayersSheet";

interface ContactOption {
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
}

interface GroupOption {
    id: string;
    name: string;
    member_count: number;
}

interface InviteRow {
    id: string;
    invitee_user_id: string;
    status: "pending" | "accepted" | "declined" | "expired" | "cancelled";
    display_name: string | null;
    avatar_url: string | null;
}

interface Props {
    matchId: string;
    contacts: ContactOption[];
    groups: GroupOption[];
    invites: InviteRow[];
}

function Avatar({ url, name }: { url: string | null; name: string }) {
    const initial = (name?.trim()[0] ?? "?").toUpperCase();
    if (url) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-7 w-7 rounded-full object-cover bg-gray-200" />
        );
    }
    return (
        <div className="h-7 w-7 rounded-full flex items-center justify-center font-semibold text-xs text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-200">
            {initial}
        </div>
    );
}

export function MatchHostInvites({ matchId, contacts, groups, invites }: Props) {
    const t = useTranslations("match_detail");
    const [sheetOpen, setSheetOpen] = React.useState(false);

    const pending = invites.filter((i) => i.status === "pending");
    const accepted = invites.filter((i) => i.status === "accepted");
    const declined = invites.filter((i) => i.status === "declined");

    return (
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6 mt-4">
            <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    {t("invites_heading")}
                </h2>
                <Button onClick={() => setSheetOpen(true)} variant="ghost">
                    {t("invite_button")}
                </Button>
            </div>

            {invites.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t("no_invites_yet")}</p>
            ) : (
                <div className="space-y-3 text-sm">
                    {pending.length > 0 && (
                        <InviteGroup label={t("invite_pending", { count: pending.length })} invites={pending} variant="pending" />
                    )}
                    {accepted.length > 0 && (
                        <InviteGroup label={t("invite_accepted", { count: accepted.length })} invites={accepted} variant="accepted" />
                    )}
                    {declined.length > 0 && (
                        <InviteGroup label={t("invite_declined", { count: declined.length })} invites={declined} variant="declined" />
                    )}
                </div>
            )}

            <InvitePlayersSheet
                matchId={matchId}
                contacts={contacts}
                groups={groups}
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
            />
        </div>
    );
}

function InviteGroup({
    label, invites, variant,
}: { label: string; invites: InviteRow[]; variant: "pending" | "accepted" | "declined" }) {
    const tone =
        variant === "pending" ? "text-orange-700 dark:text-orange-400" :
        variant === "accepted" ? "text-emerald-700 dark:text-emerald-400" :
        "text-gray-500 dark:text-gray-400";
    return (
        <div>
            <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${tone}`}>{label}</p>
            <ul className="flex flex-wrap gap-2">
                {invites.map((i) => (
                    <li
                        key={i.id}
                        className="flex items-center gap-2 px-2 py-1 rounded-full bg-gray-50 dark:bg-gray-800"
                    >
                        <Avatar url={i.avatar_url} name={i.display_name ?? "?"} />
                        <span className="text-xs text-gray-700 dark:text-gray-300 pr-1">
                            {i.display_name ?? "—"}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
