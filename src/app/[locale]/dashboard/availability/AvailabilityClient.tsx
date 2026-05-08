"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Trash2, Zap, X, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import {
    createAvailabilitySlotAction,
    deleteAvailabilitySlotAction,
    generateAvailabilitySlotsAction,
} from "../actions";

type SlotRow = {
    id: string;
    court_id: string;
    date: string;
    start_time: string;
    end_time: string;
    is_booked: boolean;
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

const DURATION_OPTIONS = [
    { label: "1 hour", value: 60 },
    { label: "1.5 hours", value: 90 },
    { label: "2 hours", value: 120 },
];

function formatTime(t: string) {
    const [h, m] = t.split(":").map(Number);
    const period = h < 12 ? "AM" : "PM";
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
}

function offsetDate(dateStr: string, days: number) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
}

function formatDateLabel(dateStr: string, today: string) {
    if (dateStr === today) return "Today";
    if (dateStr === offsetDate(today, 1)) return "Tomorrow";
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-AE", { weekday: "short", month: "short", day: "numeric" });
}

export function AvailabilityClient({ courts, slots, selectedCourtId, selectedDate, today }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const tSports = useTranslations("sports");
    const [isPending, startTransition] = useTransition();

    const [showAddForm, setShowAddForm] = useState(false);
    const [showGenerateForm, setShowGenerateForm] = useState(false);

    // Add slot form state
    const [addStart, setAddStart] = useState("08:00");
    const [addEnd, setAddEnd] = useState("09:00");
    const [addError, setAddError] = useState<string | null>(null);

    // Generate form state
    const [genFrom, setGenFrom] = useState("08:00");
    const [genTo, setGenTo] = useState("22:00");
    const [genDuration, setGenDuration] = useState(60);
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
        if (addStart >= addEnd) { setAddError("End time must be after start time"); return; }
        setAddError(null);
        startTransition(async () => {
            const result = await createAvailabilitySlotAction(selectedCourtId, selectedDate, addStart, addEnd);
            if (result.error) { setAddError(result.error); return; }
            setShowAddForm(false);
            router.refresh();
        });
    };

    const handleGenerate = () => {
        if (genFrom >= genTo) { setGenError("From time must be before to time"); return; }
        setGenError(null);
        startTransition(async () => {
            const result = await generateAvailabilitySlotsAction(selectedCourtId, selectedDate, genFrom, genTo, genDuration);
            if (result.error) { setGenError(result.error); return; }
            setShowGenerateForm(false);
            router.refresh();
        });
    };

    const handleDelete = (slot: SlotRow) => {
        if (!confirm(`Remove ${formatTime(slot.start_time)} – ${formatTime(slot.end_time)}?`)) return;
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
                            {c.name}{c.sports ? ` — ${tSports(c.sports.name as Parameters<typeof tSports>[0])}` : ""}
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
                    {formatDateLabel(selectedDate, today)}
                    <span className="ml-2 text-gray-400 dark:text-gray-500 font-normal">
                        {slots.length} slot{slots.length !== 1 ? "s" : ""}
                    </span>
                </p>
                {!showAddForm && !showGenerateForm && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => { setShowGenerateForm(true); setShowAddForm(false); }}
                            className="inline-flex items-center gap-1.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium px-3 py-1.5 rounded-xl text-sm transition-colors"
                        >
                            <Zap className="h-3.5 w-3.5" />
                            Quick Fill
                        </button>
                        <button
                            onClick={() => { setShowAddForm(true); setShowGenerateForm(false); }}
                            className="inline-flex items-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 font-medium px-3 py-1.5 rounded-xl text-sm transition-colors"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Add Slot
                        </button>
                    </div>
                )}
            </div>

            {/* Slots list */}
            {slots.length === 0 && !showAddForm && !showGenerateForm ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                        No slots open for this day. Add slots or use Quick Fill to generate a full day.
                    </p>
                    <button
                        onClick={() => setShowGenerateForm(true)}
                        className="inline-flex items-center gap-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium px-4 py-2 rounded-xl text-sm transition-colors"
                    >
                        <Zap className="h-4 w-4" />
                        Quick Fill Day
                    </button>
                </div>
            ) : slots.length > 0 && (
                <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                    {slots.map((slot) => (
                        <div
                            key={slot.id}
                            className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                        >
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                            </span>
                            <div className="flex items-center gap-2">
                                {slot.is_booked ? (
                                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium">
                                        <Lock className="h-3 w-3" />
                                        Booked
                                    </span>
                                ) : (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">
                                        Available
                                    </span>
                                )}
                                <button
                                    onClick={() => handleDelete(slot)}
                                    disabled={isPending || slot.is_booked}
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    title={slot.is_booked ? "Cannot delete a booked slot" : "Remove slot"}
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
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Add Slot</h3>
                        <button onClick={() => { setShowAddForm(false); setAddError(null); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Start</label>
                            <select
                                value={addStart}
                                onChange={(e) => setAddStart(e.target.value)}
                                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">End</label>
                            <select
                                value={addEnd}
                                onChange={(e) => setAddEnd(e.target.value)}
                                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                            </select>
                        </div>
                        <button
                            onClick={handleAddSlot}
                            disabled={isPending}
                            className="inline-flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 font-medium px-4 py-2 rounded-xl text-sm transition-colors"
                        >
                            {isPending ? "Adding..." : "Add"}
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
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Quick Fill</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                Generate {previewSlotCount > 0 ? `${previewSlotCount} slot${previewSlotCount !== 1 ? "s" : ""}` : "slots"} automatically
                            </p>
                        </div>
                        <button onClick={() => { setShowGenerateForm(false); setGenError(null); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">From</label>
                            <select
                                value={genFrom}
                                onChange={(e) => setGenFrom(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">To</label>
                            <select
                                value={genTo}
                                onChange={(e) => setGenTo(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Slot Duration</label>
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
                    </div>
                    {genError && <p className="mt-2 text-xs text-red-500">{genError}</p>}
                    <div className="flex gap-3 mt-4">
                        <button
                            onClick={handleGenerate}
                            disabled={isPending || previewSlotCount === 0}
                            className="inline-flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 font-medium px-4 py-2 rounded-xl text-sm transition-colors"
                        >
                            <Zap className="h-4 w-4" />
                            {isPending ? "Generating..." : `Generate ${previewSlotCount > 0 ? previewSlotCount : ""} Slot${previewSlotCount !== 1 ? "s" : ""}`}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowGenerateForm(false); setGenError(null); }}
                            className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium rounded-xl text-sm transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
