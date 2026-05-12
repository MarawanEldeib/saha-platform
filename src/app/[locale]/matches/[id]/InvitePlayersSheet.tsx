"use client";

/**
 * SAH-152 Phase 3: bottom-sheet that lets the match host invite specific
 * players or whole groups. Mirrors the "Select who can join" design mockup.
 *
 * The host's contacts + groups are pre-loaded on the match detail page and
 * passed in as props. Tabs: Players (contacts list + add chip) and Groups
 * (saved groups + add-all chip). Selections aggregate into a chips strip
 * at the top; Done fires inviteToMatchAction.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X, Plus, Check, Users as UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inviteToMatchAction } from "../actions";
import { SkillChip } from "@/components/matches/SkillChip";

interface ContactOption {
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    skill_rating?: number | null;
}

interface GroupOption {
    id: string;
    name: string;
    member_count: number;
}

interface Props {
    matchId: string;
    contacts: ContactOption[];
    groups: GroupOption[];
    open: boolean;
    onClose: () => void;
}

function Avatar({ url, name }: { url: string | null; name: string }) {
    const initial = (name?.trim()[0] ?? "?").toUpperCase();
    if (url) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-8 w-8 rounded-full object-cover bg-gray-200" />
        );
    }
    return (
        <div className="h-8 w-8 rounded-full flex items-center justify-center font-semibold text-xs text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-200">
            {initial}
        </div>
    );
}

export function InvitePlayersSheet({ matchId, contacts, groups, open, onClose }: Props) {
    const t = useTranslations("invite_sheet");
    const router = useRouter();
    const [tab, setTab] = React.useState<"players" | "groups">("players");
    const [selectedUsers, setSelectedUsers] = React.useState<Set<string>>(new Set());
    const [selectedGroups, setSelectedGroups] = React.useState<Set<string>>(new Set());
    const [query, setQuery] = React.useState("");
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (open) {
            setSelectedUsers(new Set());
            setSelectedGroups(new Set());
            setError(null);
            setQuery("");
        }
    }, [open]);

    if (!open) return null;

    const totalSelected = selectedUsers.size + selectedGroups.size;
    const filteredContacts = contacts.filter((c) =>
        !query.trim() ||
        (c.display_name ?? "").toLowerCase().includes(query.trim().toLowerCase())
    );

    function toggleUser(id: string) {
        setSelectedUsers((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleGroup(id: string) {
        setSelectedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function submit() {
        setError(null);
        setSubmitting(true);
        const result = await inviteToMatchAction(
            matchId,
            Array.from(selectedUsers),
            Array.from(selectedGroups),
        );
        setSubmitting(false);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        onClose();
        router.refresh();
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
            <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
                    <h3 className="font-semibold text-gray-900 dark:text-white">{t("title")}</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 p-1"
                        aria-label={t("close")}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 p-2 bg-gray-50 dark:bg-gray-950 m-2 rounded-lg">
                    <button
                        onClick={() => setTab("players")}
                        className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            tab === "players"
                                ? "bg-emerald-600 text-white"
                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                    >
                        {t("tab_players")}
                    </button>
                    <button
                        onClick={() => setTab("groups")}
                        className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            tab === "groups"
                                ? "bg-emerald-600 text-white"
                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                    >
                        {t("tab_groups")}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {tab === "players" && (
                        <>
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={t("search_placeholder")}
                                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <p className="text-xs uppercase font-semibold text-gray-500 dark:text-gray-400 tracking-wide mb-2">
                                {t("suggested")}
                            </p>
                            {filteredContacts.length === 0 ? (
                                <p className="text-sm text-gray-500 italic">{t("no_contacts")}</p>
                            ) : (
                                <ul className="space-y-1">
                                    {filteredContacts.map((c) => {
                                        const selected = selectedUsers.has(c.user_id);
                                        return (
                                            <li key={c.user_id}>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleUser(c.user_id)}
                                                    className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                                                >
                                                    <Avatar url={c.avatar_url} name={c.display_name ?? "?"} />
                                                    <span className="flex-1 text-sm text-left text-gray-900 dark:text-white">
                                                        {c.display_name ?? t("anonymous")}
                                                    </span>
                                                    <SkillChip rating={c.skill_rating} />
                                                    <span className={`inline-flex items-center justify-center h-7 w-7 rounded-full border-2 ${
                                                        selected
                                                            ? "border-emerald-500 bg-emerald-500 text-white"
                                                            : "border-dashed border-emerald-500 text-emerald-600 dark:text-emerald-400"
                                                    }`}>
                                                        {selected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </>
                    )}

                    {tab === "groups" && (
                        <>
                            <p className="text-xs uppercase font-semibold text-gray-500 dark:text-gray-400 tracking-wide mb-2">
                                {t("your_groups")}
                            </p>
                            {groups.length === 0 ? (
                                <p className="text-sm text-gray-500 italic">{t("no_groups")}</p>
                            ) : (
                                <ul className="space-y-1">
                                    {groups.map((g) => {
                                        const selected = selectedGroups.has(g.id);
                                        return (
                                            <li key={g.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleGroup(g.id)}
                                                    className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                                                >
                                                    <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                                                        <UsersIcon className="h-4 w-4" />
                                                    </div>
                                                    <div className="flex-1 text-left min-w-0">
                                                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{g.name}</div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                                            {t("members_count", { count: g.member_count })}
                                                        </div>
                                                    </div>
                                                    <span className={`inline-flex items-center justify-center h-7 w-7 rounded-full border-2 ${
                                                        selected
                                                            ? "border-emerald-500 bg-emerald-500 text-white"
                                                            : "border-dashed border-emerald-500 text-emerald-600 dark:text-emerald-400"
                                                    }`}>
                                                        {selected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </>
                    )}
                </div>

                {error && (
                    <div className="px-4 pb-2 text-sm text-red-600 dark:text-red-400" role="alert">
                        {error}
                    </div>
                )}

                <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex items-center gap-2">
                    <Button
                        onClick={submit}
                        disabled={submitting || totalSelected === 0}
                    >
                        {submitting ? t("sending") : t("done_with_count", { count: totalSelected })}
                    </Button>
                    <Button variant="ghost" onClick={onClose}>
                        {t("cancel")}
                    </Button>
                </div>
            </div>
        </div>
    );
}
