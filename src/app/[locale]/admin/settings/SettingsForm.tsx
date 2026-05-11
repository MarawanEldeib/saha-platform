"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { updatePlatformSettingAction } from "../actions";

type FormType = "number" | "text" | "boolean";

interface Props {
    settingKey: string;
    label: string;
    type: FormType;
    initialValue: number | string | boolean;
    hint?: string;
    /** When true, show a confirm dialog with diff before saving. */
    confirm?: boolean;
}

export function SettingsForm({ settingKey, label, type, initialValue, hint, confirm }: Props) {
    const router = useRouter();
    const [value, setValue] = React.useState<number | string | boolean>(initialValue);
    const [isPending, startTransition] = React.useTransition();
    const [error, setError] = React.useState<string | null>(null);
    const [saved, setSaved] = React.useState(false);
    const [confirmOpen, setConfirmOpen] = React.useState(false);

    const dirty = value !== initialValue;

    const performSave = () => {
        setError(null);
        setSaved(false);
        startTransition(async () => {
            const payload: unknown =
                type === "number" ? Number(value)
                    : type === "boolean" ? Boolean(value)
                        : String(value).trim();
            const res = await updatePlatformSettingAction(settingKey, payload);
            if (res?.error) { setError(res.error); return; }
            setSaved(true);
            setConfirmOpen(false);
            router.refresh();
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (confirm && dirty) {
            setConfirmOpen(true);
        } else {
            performSave();
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 flex-1 min-w-[12rem]">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
                {type === "boolean" ? (
                    <select
                        value={String(value)}
                        onChange={(e) => setValue(e.target.value === "true")}
                        className="text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    >
                        <option value="true">On</option>
                        <option value="false">Off</option>
                    </select>
                ) : (
                    <input
                        type={type === "number" ? "number" : "text"}
                        value={type === "number" ? Number(value) : String(value)}
                        onChange={(e) => setValue(type === "number" ? e.target.valueAsNumber : e.target.value)}
                        className="text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                )}
                {hint && <span className="text-xs text-gray-500 dark:text-gray-400">{hint}</span>}
            </label>
            <button
                type="submit"
                disabled={!dirty || isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:opacity-90 disabled:opacity-40"
            >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : null}
                {isPending ? "Saving…" : saved && !dirty ? "Saved" : "Save"}
            </button>
            {error && <p className="text-sm text-red-600 basis-full">{error}</p>}

            {confirmOpen && (
                <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 w-full max-w-md p-5 space-y-4">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Confirm change · {label}</h3>
                        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 px-3 py-2 text-sm">
                            <div className="text-gray-500 dark:text-gray-400 text-xs">Previous</div>
                            <div className="font-mono text-gray-900 dark:text-white">{String(initialValue)}</div>
                            <div className="text-gray-500 dark:text-gray-400 text-xs mt-2">Next</div>
                            <div className="font-mono text-gray-900 dark:text-white">{String(value)}</div>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            This affects all future bookings. Action is audit-logged.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setConfirmOpen(false)}
                                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={performSave}
                                disabled={isPending}
                                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm hover:bg-amber-700 disabled:opacity-50"
                            >
                                {isPending ? "Saving…" : "Confirm save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </form>
    );
}
