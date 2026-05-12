"use client";

/**
 * SAH-152 Phase 3: contacts + groups management.
 *
 * Two tabs: Contacts and Groups.
 *   - Contacts: search → +add. Click an existing contact to remove.
 *   - Groups: list of saved groups with member count. New / Edit modal lets
 *     the owner name the group and pick members from their contacts.
 *
 * Optimistic UI everywhere — actions return ok or an error string; on
 * failure the row reverts and the error shows inline.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Search, X, Trash2, Users as UsersIcon, Edit2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SkillChip } from "@/components/matches/SkillChip";
import {
    addContactAction,
    removeContactAction,
    searchPlayersAction,
    createGroupAction,
    updateGroupAction,
    deleteGroupAction,
    type PlayerSearchHit,
} from "./actions";

interface Contact {
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    skill_rating?: number | null;
}

interface Group {
    id: string;
    name: string;
    member_count: number;
    members: Contact[];
}

interface Props {
    initialContacts: Contact[];
    initialGroups: Group[];
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
        <div className="h-9 w-9 rounded-full flex items-center justify-center font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-200">
            {initial}
        </div>
    );
}

export function ContactsClient({ initialContacts, initialGroups }: Props) {
    const t = useTranslations("contacts");
    const router = useRouter();
    const [tab, setTab] = React.useState<"contacts" | "groups">("contacts");
    const [contacts, setContacts] = React.useState<Contact[]>(initialContacts);
    const [groups, setGroups] = React.useState<Group[]>(initialGroups);

    // ---- Contacts tab state ----
    const [query, setQuery] = React.useState("");
    const [searchHits, setSearchHits] = React.useState<PlayerSearchHit[]>([]);
    const [searching, setSearching] = React.useState(false);
    const [actionError, setActionError] = React.useState<string | null>(null);

    // Debounced search.
    React.useEffect(() => {
        const handle = setTimeout(async () => {
            const q = query.trim();
            if (q.length < 2) {
                setSearchHits([]);
                return;
            }
            setSearching(true);
            const result = await searchPlayersAction(q);
            setSearching(false);
            if (result.ok) {
                const existing = new Set(contacts.map((c) => c.user_id));
                setSearchHits((result.data ?? []).filter((h) => !existing.has(h.id)));
            }
        }, 300);
        return () => clearTimeout(handle);
    }, [query, contacts]);

    async function handleAdd(hit: PlayerSearchHit) {
        setActionError(null);
        const optimistic: Contact = {
            user_id: hit.id,
            display_name: hit.display_name,
            avatar_url: hit.avatar_url,
            skill_rating: hit.skill_rating ?? null,
        };
        setContacts((prev) => [optimistic, ...prev]);
        setSearchHits((prev) => prev.filter((h) => h.id !== hit.id));
        const result = await addContactAction(hit.id);
        if (!result.ok) {
            setContacts((prev) => prev.filter((c) => c.user_id !== hit.id));
            setActionError(result.error);
        }
        router.refresh();
    }

    async function handleRemove(contact: Contact) {
        setActionError(null);
        if (!window.confirm(t("confirm_remove", { name: contact.display_name ?? "this player" }))) return;
        const snapshot = contacts;
        setContacts((prev) => prev.filter((c) => c.user_id !== contact.user_id));
        const result = await removeContactAction(contact.user_id);
        if (!result.ok) {
            setContacts(snapshot);
            setActionError(result.error);
        }
        router.refresh();
    }

    // ---- Groups tab state ----
    const [editing, setEditing] = React.useState<Group | null>(null);
    const [draftName, setDraftName] = React.useState("");
    const [draftMembers, setDraftMembers] = React.useState<Set<string>>(new Set());
    const [groupOpen, setGroupOpen] = React.useState(false);
    const [groupBusy, setGroupBusy] = React.useState(false);

    function openNewGroup() {
        setEditing(null);
        setDraftName("");
        setDraftMembers(new Set());
        setGroupOpen(true);
    }

    function openEditGroup(g: Group) {
        setEditing(g);
        setDraftName(g.name);
        setDraftMembers(new Set(g.members.map((m) => m.user_id)));
        setGroupOpen(true);
    }

    function toggleMember(id: string) {
        setDraftMembers((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function submitGroup() {
        setActionError(null);
        setGroupBusy(true);
        const name = draftName.trim();
        const memberIds = Array.from(draftMembers);
        const result = editing
            ? await updateGroupAction(editing.id, name, memberIds)
            : await createGroupAction(name, memberIds);
        setGroupBusy(false);
        if (!result.ok) {
            setActionError(result.error);
            return;
        }
        setGroupOpen(false);
        router.refresh();
    }

    async function handleDeleteGroup(g: Group) {
        if (!window.confirm(t("confirm_delete_group", { name: g.name }))) return;
        const snapshot = groups;
        setGroups((prev) => prev.filter((x) => x.id !== g.id));
        const result = await deleteGroupAction(g.id);
        if (!result.ok) {
            setGroups(snapshot);
            setActionError(result.error);
        }
        router.refresh();
    }

    return (
        <div>
            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-800">
                <button
                    onClick={() => setTab("contacts")}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        tab === "contacts"
                            ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                            : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700"
                    }`}
                >
                    {t("tab_contacts", { count: contacts.length })}
                </button>
                <button
                    onClick={() => setTab("groups")}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        tab === "groups"
                            ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                            : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700"
                    }`}
                >
                    {t("tab_groups", { count: groups.length })}
                </button>
            </div>

            {actionError && (
                <div className="mb-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                    {actionError}
                </div>
            )}

            {tab === "contacts" && (
                <div className="space-y-4">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute top-1/2 -translate-y-1/2 left-3 h-4 w-4 text-gray-400" />
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t("search_placeholder")}
                            className="pl-9"
                        />
                    </div>

                    {searchHits.length > 0 && (
                        <ul className="rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                            {searchHits.map((hit) => (
                                <li key={hit.id} className="flex items-center gap-3 px-3 py-2">
                                    <Avatar url={hit.avatar_url} name={hit.display_name ?? "?"} />
                                    <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">
                                        {hit.display_name ?? t("anonymous")}
                                    </span>
                                    <SkillChip rating={hit.skill_rating} />
                                    <button
                                        onClick={() => handleAdd(hit)}
                                        className="inline-flex items-center justify-center h-8 w-8 rounded-full border-2 border-dashed border-emerald-500 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                                        aria-label={t("add")}
                                    >
                                        <Plus className="h-4 w-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {searching && <p className="text-xs text-gray-500">{t("searching")}</p>}

                    {/* Existing contacts */}
                    <h2 className="text-xs uppercase font-semibold text-gray-500 dark:text-gray-400 tracking-wide pt-2">
                        {t("your_contacts")}
                    </h2>
                    {contacts.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                            {t("no_contacts")}
                        </p>
                    ) : (
                        <ul className="rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                            {contacts.map((c) => (
                                <li key={c.user_id} className="flex items-center gap-3 px-3 py-2">
                                    <Avatar url={c.avatar_url} name={c.display_name ?? "?"} />
                                    <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">
                                        {c.display_name ?? t("anonymous")}
                                    </span>
                                    <SkillChip rating={c.skill_rating} />
                                    <button
                                        onClick={() => handleRemove(c)}
                                        className="text-gray-400 hover:text-red-500 p-1.5 rounded"
                                        aria-label={t("remove")}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {tab === "groups" && (
                <div className="space-y-4">
                    <Button onClick={openNewGroup}>
                        <Plus className="h-4 w-4 mr-1" />
                        {t("new_group")}
                    </Button>

                    {groups.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                            {t("no_groups")}
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {groups.map((g) => (
                                <li
                                    key={g.id}
                                    className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-center gap-3"
                                >
                                    <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                                        <UsersIcon className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-gray-900 dark:text-white truncate">{g.name}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                            {t("members_count", { count: g.member_count })}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => openEditGroup(g)}
                                        className="text-gray-400 hover:text-emerald-600 p-1.5"
                                        aria-label={t("edit")}
                                    >
                                        <Edit2 className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteGroup(g)}
                                        className="text-gray-400 hover:text-red-500 p-1.5"
                                        aria-label={t("delete")}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* Group new/edit modal */}
            {groupOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                                {editing ? t("edit_group") : t("new_group")}
                            </h3>
                            <button
                                onClick={() => setGroupOpen(false)}
                                className="text-gray-400 hover:text-gray-600 p-1"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-4 space-y-4 overflow-y-auto">
                            <div>
                                <label htmlFor="group_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t("group_name_label")}
                                </label>
                                <Input
                                    id="group_name"
                                    value={draftName}
                                    onChange={(e) => setDraftName(e.target.value)}
                                    placeholder={t("group_name_placeholder")}
                                    maxLength={60}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    {t("members_label", { count: draftMembers.size })}
                                </label>
                                {contacts.length === 0 ? (
                                    <p className="text-xs text-gray-500 italic">{t("no_contacts_for_group")}</p>
                                ) : (
                                    <ul className="space-y-1 max-h-60 overflow-y-auto">
                                        {contacts.map((c) => (
                                            <li key={c.user_id}>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleMember(c.user_id)}
                                                    className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg border transition-colors ${
                                                        draftMembers.has(c.user_id)
                                                            ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30"
                                                            : "border-gray-200 dark:border-gray-800 hover:border-gray-300"
                                                    }`}
                                                >
                                                    <Avatar url={c.avatar_url} name={c.display_name ?? "?"} />
                                                    <span className="flex-1 text-sm text-left text-gray-900 dark:text-white">
                                                        {c.display_name ?? t("anonymous")}
                                                    </span>
                                                    {draftMembers.has(c.user_id) && (
                                                        <span className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                                                            ✓
                                                        </span>
                                                    )}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex items-center gap-2">
                            <Button onClick={submitGroup} disabled={groupBusy || draftName.trim().length === 0}>
                                {groupBusy ? t("saving") : editing ? t("save") : t("create")}
                            </Button>
                            <Button variant="ghost" onClick={() => setGroupOpen(false)}>
                                {t("cancel")}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
