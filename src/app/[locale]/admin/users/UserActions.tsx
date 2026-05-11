"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Shield, ShieldOff, UserCog, Trash2, X } from "lucide-react";
import {
    adminBanUserAction,
    adminUnbanUserAction,
    adminChangeUserRoleAction,
    adminDeleteUserAction,
} from "../actions";

interface Props {
    userId: string;
    displayName: string;
    currentRole: "user" | "business" | "admin";
    isBanned: boolean;
}

type Modal =
    | { kind: "ban" }
    | { kind: "role" }
    | { kind: "delete" }
    | null;

export function UserActions({ userId, displayName, currentRole, isBanned }: Props) {
    const router = useRouter();
    const [open, setOpen] = React.useState(false);
    const [modal, setModal] = React.useState<Modal>(null);
    const [isPending, startTransition] = React.useTransition();
    const [error, setError] = React.useState<string | null>(null);

    // Inputs
    const [banReason, setBanReason] = React.useState("");
    const [nextRole, setNextRole] = React.useState<"user" | "business" | "admin">(currentRole);
    const [confirmText, setConfirmText] = React.useState("");

    const closeAll = () => { setOpen(false); setModal(null); setError(null); setBanReason(""); setNextRole(currentRole); setConfirmText(""); };

    const runBan = () => {
        setError(null);
        startTransition(async () => {
            const res = await adminBanUserAction(userId, banReason);
            if (res?.error) { setError(res.error); return; }
            closeAll(); router.refresh();
        });
    };
    const runUnban = () => {
        setError(null);
        startTransition(async () => {
            const res = await adminUnbanUserAction(userId);
            if (res?.error) { setError(res.error); return; }
            closeAll(); router.refresh();
        });
    };
    const runRole = () => {
        setError(null);
        startTransition(async () => {
            const res = await adminChangeUserRoleAction(userId, nextRole);
            if (res?.error) { setError(res.error); return; }
            closeAll(); router.refresh();
        });
    };
    const runDelete = () => {
        setError(null);
        startTransition(async () => {
            const res = await adminDeleteUserAction(userId, confirmText);
            if (res?.error) { setError(res.error); return; }
            closeAll(); router.refresh();
        });
    };

    return (
        <div className="relative inline-block text-left">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center justify-center p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="User actions"
            >
                <MoreHorizontal className="h-4 w-4" />
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 z-20 mt-1 w-44 origin-top-right rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg">
                        <div className="py-1 text-sm">
                            {!isBanned ? (
                                <button
                                    onClick={() => { setOpen(false); setModal({ kind: "ban" }); }}
                                    className="flex items-center gap-2 w-full px-3 py-2 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                >
                                    <ShieldOff className="h-3.5 w-3.5" /> Ban user
                                </button>
                            ) : (
                                <button
                                    onClick={runUnban}
                                    disabled={isPending}
                                    className="flex items-center gap-2 w-full px-3 py-2 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50"
                                >
                                    <Shield className="h-3.5 w-3.5" /> Unban user
                                </button>
                            )}
                            <button
                                onClick={() => { setOpen(false); setModal({ kind: "role" }); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                <UserCog className="h-3.5 w-3.5" /> Change role
                            </button>
                            <button
                                onClick={() => { setOpen(false); setModal({ kind: "delete" }); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                            >
                                <Trash2 className="h-3.5 w-3.5" /> Hard delete
                            </button>
                        </div>
                    </div>
                </>
            )}

            {modal && (
                <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 w-full max-w-md p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                                {modal.kind === "ban" && `Ban ${displayName}`}
                                {modal.kind === "role" && `Change role · ${displayName}`}
                                {modal.kind === "delete" && `Delete ${displayName}`}
                            </h3>
                            <button onClick={closeAll} className="p-1 text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
                        </div>

                        {modal.kind === "ban" && (
                            <>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Soft delete — marks the user for deletion in 30 days and signs them out. The row stays for audit.
                                </p>
                                <label className="block text-sm">
                                    <span className="text-gray-700 dark:text-gray-300">Reason (optional)</span>
                                    <input
                                        type="text"
                                        value={banReason}
                                        onChange={(e) => setBanReason(e.target.value)}
                                        className="mt-1 w-full text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    />
                                </label>
                                {error && <p className="text-sm text-red-600">{error}</p>}
                                <div className="flex justify-end gap-2">
                                    <button onClick={closeAll} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm">Cancel</button>
                                    <button onClick={runBan} disabled={isPending} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm hover:bg-amber-700 disabled:opacity-50">{isPending ? "Banning…" : "Ban user"}</button>
                                </div>
                            </>
                        )}

                        {modal.kind === "role" && (
                            <>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Promote or demote. Audited.
                                </p>
                                <label className="block text-sm">
                                    <span className="text-gray-700 dark:text-gray-300">New role</span>
                                    <select
                                        value={nextRole}
                                        onChange={(e) => setNextRole(e.target.value as "user" | "business" | "admin")}
                                        className="mt-1 w-full text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    >
                                        <option value="user">user</option>
                                        <option value="business">business</option>
                                        <option value="admin">admin</option>
                                    </select>
                                </label>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Current: {currentRole}</p>
                                {error && <p className="text-sm text-red-600">{error}</p>}
                                <div className="flex justify-end gap-2">
                                    <button onClick={closeAll} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm">Cancel</button>
                                    <button onClick={runRole} disabled={isPending || nextRole === currentRole} className="px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm hover:opacity-90 disabled:opacity-50">{isPending ? "Saving…" : "Save"}</button>
                                </div>
                            </>
                        )}

                        {modal.kind === "delete" && (
                            <>
                                <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-700 dark:text-red-400">
                                    Hard delete via Supabase Auth (PDPL right to erasure). All bookings / reviews / events cascade. Type the display name to confirm.
                                </div>
                                <label className="block text-sm">
                                    <span className="text-gray-700 dark:text-gray-300">Confirm: type <span className="font-mono">{displayName}</span></span>
                                    <input
                                        type="text"
                                        value={confirmText}
                                        onChange={(e) => setConfirmText(e.target.value)}
                                        autoComplete="off"
                                        className="mt-1 w-full text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    />
                                </label>
                                {error && <p className="text-sm text-red-600">{error}</p>}
                                <div className="flex justify-end gap-2">
                                    <button onClick={closeAll} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm">Cancel</button>
                                    <button onClick={runDelete} disabled={isPending || confirmText !== displayName} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50">{isPending ? "Deleting…" : "Permanently delete"}</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
