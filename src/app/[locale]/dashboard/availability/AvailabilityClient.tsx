"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Plus, Trash2, Zap, X, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import {
    createAvailabilitySlotAction,
    deleteAvailabilitySlotAction,
    generateAvailabilitySlotsAction,
} from "../actions";
import { SESSION_TYPES, SESSION_TYPE_GLYPHS, SESSION_TYPE_STYLES, type SessionType } from "@/lib/session-types";

type SlotRow = {
    id: string;
    court_id: string;
    date: string;
    start_time: string;
    end_time: string;
    is_booked: boolean;
    session_type?: string | null;
    created_at: string;
};

type CourtOption = {
    id: string;
    name: string;
    sports: { name: string } | null;
};

type Props = {
    courts: CourtOption[];
    slots: SlotRow[];
    selectedCourtId: string;
    selectedDate: string;
    today: string;
};

// Half-hour increments from 05:00 to 24:00
const TIME_OPTIONS = Array.from({ length: 38 }, (_, i) => {
    const totalMins = 300 + i * 30; // start at 05:00
    const h = Math.floor(totalMins / 60).toString().padStart(2, "0");
    const m = (totalMins % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
});

// 24-hour formatting works in every locale we support — avoids the
// AM/PM translation problem and matches how owners usually input time.
function formatTime(t: string) {
    return t.slice(0, 5);
}

function offsetDate(dateStr: string, days: number) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
}

export function AvailabilityClient({ courts, slots, selectedCourtId, selectedDate, today }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const tSports = useTranslations("sports");
    const t = useTranslations("dashboard_availability");
    const locale = useLocale();
    const knownSports = ["Padel", "Pickleball", "Tennis", "Squash", "Badminton"] as const;
    const sportName = (name: string) =>
        knownSports.includes(name as typeof knownSports[number]) ? tSports(name as typeof knownSports[number]) : name;
    const [isPending, startTransition] = useTransition();

    const DURATION_OPTIONS = [
        { label: t("duration_1h"), value: 60 },
        { label: t("duration_1_5h"), value: 90 },
        { label: t("duration_2h"), value: 120 },
    ];

    function formatDateLabel(dateStr: string) {
        if (dateStr === today) return t("today");
        if (dateStr === offsetDate(today, 1)) return t("tomorrow");
        const d = new Date(dateStr + "T00:00:00");
        return d.toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE", { weekday: "short", month: "short", day: "numeric" });
    }

    const [showAddForm, setShowAddForm] = useState(false);
    const [showGenerateForm, setShowGenerateForm] = useState(false);

    // Add slot form state
    const [addStart, setAddStart] = useState("08:00");
    const [addEnd, setAddEnd] = useState("09:00");
    const [addSessionType, setAddSessionType] = useState<SessionType>("mixed");
    const [addError, setAddError] = useState<string | null>(null);

    // Generate form state
    const [genFrom, setGenFrom] = useState("08:00");
    const [genTo, setGenTo] = useState("22:00");
    const [genDuration, setGenDuration] = useState(60);
    const [genSessionType, setGenSessionType] = useState<SessionType>("mixed");
    const [genError, setGenError] = useState<string | null>(null);

    function navigate(courtId: string, date: string) {
        router.push(`${pathname}?court=${courtId}&date=${date}`);
    }

    function handleCourtChange(e: React.ChangeEvent<HTMLSelectElement>) {
        navigate(e.target.value, selectedDate);
    }

    function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
        navigate(selectedCourtId, e.target.value);
    }

    function prevDay() { navigate(selectedCourtId, offsetDate(selectedDate, -1)); }
    function nextDay() { navigate(selectedCourtId, offsetDate(selectedDate, 1)); }

    const handleAddSlot = () => {
        if (addStart >= addEnd) { setAddError(t("error_end_after_start")); return; }
        setAddError(null);
        startTransition(async () => {
            const result = await createAvailabilitySlotAction(selectedCourtId, selectedDate, addStart, addEnd, addSessionType);
            if (result.error) { setAddError(result.error); return; }
            setShowAddForm(false);
            router.refresh();
        });
    };

    const handleGenerate = () => {
        if (genFrom >= genTo) { setGenError(t("error_from_before_to")); return; }
        setGenError(null);
        startTransition(async () => {
            const result = await generateAvailabilitySlotsAction(selectedCourtId, selectedDate, genFrom, genTo, genDuration, genSessionType);
            if (result.error) { setGenError(result.error); return; }
            setShowGenerateForm(false);
            router.refresh();
        });
    };

    const handleDelete = (slot: SlotRow) => {
        if (!confirm(t("confirm_remove_slot", { range: `${formatTime(slot.start_time)} – ${formatTime(slot.end_time)}` }))) return;
        startTransition(async () => {
            const result = await deleteAvailabilitySlotAction(slot.id);
            if (result.error) alert(result.error);
            else router.refresh();
        });
    };

    const previewSlotCount = (() => {
        const start = genFrom.split(":").map(Number);
        const end = genTo.split(":").map(Number);
        const startMins = start[0] * 60 + start[1];
        const endMins = end[0] * 60 + end[1];
        if (endMins <= startMins) return 0;
        return Math.floor((endMins - startMins) / genDuration);
    })();

    return (
        <div className="space-y-6">
            {/* Court + Date selectors */}
            <div className="flex flex-col sm:flex-row gap-3">
                <select
                    value={selectedCourtId}
                    onChange={handleCourtChange}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                    {courts.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.name}{c.sports ? ` — ${sportName(c.sports.name)}` : ""}
                        </option>
                    ))}
                </select>

                <div className="flex items-center gap-1">
                    <button
                        onClick={prevDay}
                        className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        <ChevronLeft className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    </button>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={handleDateChange}
                        className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                        onClick={nextDay}
                        className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        <ChevronRight className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    </button>
                </div>
            </div>

            {/* Date label */}
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {formatDateLabel(selectedDate)}
                    <span className="ml-2 text-gray-400 dark:text-gray-500 font-normal">
                        {t("slots_count", { count: slots.length })}
                    </span>
                </p>
                {!showAddForm && !showGenerateForm && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => { setShowGenerateForm(true); setShowAddForm(false); }}
                            className="inline-flex items-center gap-1.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium px-3 py-1.5 rounded-xl text-sm transition-colors"
                        >
                            <Zap className="h-3.5 w-3.5" />
                            {t("quick_fill_button")}
                        </button>
                        <button
                            onClick={() => { setShowAddForm(true); setShowGenerateForm(false); }}
                            className="inline-flex items-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 font-medium px-3 py-1.5 rounded-xl text-sm transition-colors"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            {t("add_slot_button")}
                        </button>
                    </div>
                )}
            </div>

            {/* Slots list */}
            {slots.length === 0 && !showAddForm && !showGenerateForm ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{t("no_slots_help")}</p>
                    <button
                        onClick={() => setShowGenerateForm(true)}
                        className="inline-flex items-center gap-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium px-4 py-2 rounded-xl text-sm transition-colors"
                    >
                        <Zap className="h-4 w-4" />
                        {t("quick_fill_day_button")}
                    </button>
                </div>
            ) : slots.length > 0 && (
                <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                    {slots.map((slot) => (
                        <div
                            key={slot.id}
                            className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                                </span>
                                {slot.session_type && slot.session_type !== "mixed" && (
                                    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${SESSION_TYPE_STYLES[slot.session_type as SessionType] ?? ""}`}>
                                        {SESSION_TYPE_GLYPHS[slot.session_type as SessionType]} {t(`session_${slot.session_type}`)}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {slot.is_booked ? (
                                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium">
                                        <Lock className="h-3 w-3" />
                                        {t("booked")}
                                    </span>
                                ) : (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">
                                        {t("available")}
                                    </span>
                                )}
                                <button
                                    onClick={() => handleDelete(slot)}
                                    disabled={isPending || slot.is_booked}
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    title={slot.is_booked ? t("cannot_delete_booked") : t("remove_slot")}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add Slot form */}
            {showAddForm && (
                <div className="border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t("add_slot_button")}</h3>
                        <button onClick={() => { setShowAddForm(false); setAddError(null); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("start_label")}</label>
                            <select
                                value={addStart}
                                onChange={(e) => setAddStart(e.target.value)}
                                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("end_label")}</label>
                            <select
                                value={addEnd}
                                onChange={(e) => setAddEnd(e.target.value)}
                                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("session_label")}</label>
                            <select
                                value={addSessionType}
                                onChange={(e) => setAddSessionType(e.target.value as SessionType)}
                                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                                {SESSION_TYPES.map((s) => <option key={s} value={s}>{t(`session_${s}`)}</option>)}
                            </select>
                        </div>
                        <button
                            onClick={handleAddSlot}
                            disabled={isPending}
                            className="inline-flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 font-medium px-4 py-2 rounded-xl text-sm transition-colors"
                        >
                            {isPending ? t("adding") : t("add")}
                        </button>
                    </div>
                    {addError && <p className="mt-2 text-xs text-red-500">{addError}</p>}
                </div>
            )}

            {/* Quick Fill form */}
            {showGenerateForm && (
                <div className="border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t("quick_fill_button")}</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {t("generate_preview", { count: previewSlotCount })}
                            </p>
                        </div>
                        <button onClick={() => { setShowGenerateForm(false); setGenError(null); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("from_label")}</label>
                            <select
                                value={genFrom}
                                onChange={(e) => setGenFrom(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("to_label")}</label>
                            <select
                                value={genTo}
                                onChange={(e) => setGenTo(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("slot_duration_label")}</label>
                            <select
                                value={genDuration}
                                onChange={(e) => setGenDuration(Number(e.target.value))}
                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                                {DURATION_OPTIONS.map((d) => (
                                    <option key={d.value} value={d.value}>{d.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("session_label")}</label>
                            <select
                                value={genSessionType}
                                onChange={(e) => setGenSessionType(e.target.value as SessionType)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                                {SESSION_TYPES.map((s) => <option key={s} value={s}>{t(`session_${s}`)}</option>)}
                            </select>
                        </div>
                    </div>
                    {genError && <p className="mt-2 text-xs text-red-500">{genError}</p>}
                    <div className="flex gap-3 mt-4">
                        <button
                            onClick={handleGenerate}
                            disabled={isPending || previewSlotCount === 0}
                            className="inline-flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 font-medium px-4 py-2 rounded-xl text-sm transition-colors"
                        >
                            <Zap className="h-4 w-4" />
                            {isPending ? t("generating") : t("generate_button", { count: previewSlotCount })}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowGenerateForm(false); setGenError(null); }}
                            className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium rounded-xl text-sm transition-colors"
                        >
                            {t("cancel")}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
