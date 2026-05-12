"use client";

import React from "react";
import { useTranslations, useLocale } from "next-intl";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { Search, Loader2, ChevronRight, ChevronUp, MapPin, Sparkles, X } from "lucide-react";
import Link from "next/link";
import type { Sport } from "@/types/database";
import { parseSearchQueryAction } from "@/app/[locale]/dashboard/actions";

const MapContainer = dynamic(
    () => import("@/components/map/MapboxMap"),
    { ssr: false, loading: () => <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-900"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div> }
);

interface FacilityResult {
    id: string;
    name: string;
    description: string | null;
    address: string;
    city: string;
    location: unknown;
    status: string;
    distance_m: number;
    has_prayer_room?: boolean;
    has_wudu_area?: boolean;
    lat?: number;
    lng?: number;
}

export default function MapPage() {
    const t = useTranslations("map");
    const tSports = useTranslations("sports");
    const locale = useLocale();
    const knownSports = ["Padel", "Pickleball", "Tennis", "Squash", "Badminton"] as const;
    const sportName = (name: string) =>
        knownSports.includes(name as typeof knownSports[number]) ? tSports(name as typeof knownSports[number]) : name;

    const [sports, setSports] = React.useState<Sport[]>([]);
    const [facilities, setFacilities] = React.useState<FacilityResult[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [selectedSport, setSelectedSport] = React.useState<number | null>(null);
    const [searchQuery, setSearchQuery] = React.useState("");
    const [userLat, setUserLat] = React.useState(25.2048); // Default: Dubai
    const [userLng, setUserLng] = React.useState(55.2708);
    const [selectedFacility, setSelectedFacility] = React.useState<FacilityResult | null>(null);
    const [isOutsideUAE, setIsOutsideUAE] = React.useState(false);
    // SAH-32: bottom-sheet UX on mobile. The map is always visible underneath;
    // the sheet expands over it on tap. Two snap states keep this simple and
    // accessible — no drag handlers, no extra dep.
    //   peek     — handle + result count only (~96px). Map gets most of the screen.
    //   expanded — sheet covers most of the screen; map shows as ~25vh at the top.
    const [sheetExpanded, setSheetExpanded] = React.useState(false);
    const [aiPending, setAiPending] = React.useState(false);
    const [aiHidden, setAiHidden] = React.useState(false);
    const [prayerFriendlyOnly, setPrayerFriendlyOnly] = React.useState(false);

    // SAH-41: AI-applied filters. Stored as state so the existing fetch
    // useEffect can pass them to the RPC, and so the chip below can render
    // a clear-button. `aiLabel` is the human summary shown on the chip.
    const [dayOfWeekFilter, setDayOfWeekFilter] = React.useState<number | null>(null);
    const [timeWindow, setTimeWindow] = React.useState<{ start: string; end: string } | null>(null);
    const [aiLabel, setAiLabel] = React.useState<string | null>(null);

    // Fetch sports for filter
    React.useEffect(() => {
        const fetchSports = async () => {
            const supabase = createClient();
            const { data } = await supabase
                .from("sports")
                .select("*")
                .in("name", ["Padel", "Pickleball", "Squash", "Tennis", "Badminton"])
                .order("name");
            if (data) setSports(data);
        };
        fetchSports();

        // Try to get user location
        navigator.geolocation?.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const inUAE = lat >= 22.63 && lat <= 26.09 && lng >= 51.50 && lng <= 56.40;
                if (inUAE) {
                    setUserLat(lat);
                    setUserLng(lng);
                } else {
                    setIsOutsideUAE(true);
                    // Keep Dubai defaults
                }
            },
            () => { } // Fail silently — default to Dubai
        );
    }, []);

    // Fetch facilities when filters change
    React.useEffect(() => {
        const fetchFacilities = async () => {
            setLoading(true);
            const supabase = createClient();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc("facilities_within_radius", {
                lat: userLat,
                lng: userLng,
                radius_km: 15,
                sport_filter: selectedSport,
                day_of_week_filter: dayOfWeekFilter,
                time_window_start: timeWindow?.start ?? null,
                time_window_end: timeWindow?.end ?? null,
            });

            if (!error && data) {
                setFacilities(data);
            }
            setLoading(false);
        };

        fetchFacilities();
    }, [userLat, userLng, selectedSport, dayOfWeekFilter, timeWindow]);

    const filteredFacilities = facilities
        .filter((f) =>
            !searchQuery ||
            f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            f.city.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .filter((f) => !prayerFriendlyOnly || f.has_prayer_room || f.has_wudu_area);

    // Selecting a facility from the list or a marker — auto-collapse the
    // sheet so the user can see the marker on the map.
    const onSelectFacility = (f: FacilityResult | null) => {
        setSelectedFacility(f);
        if (f) setSheetExpanded(false);
    };

    // SAH-41: translate parsed AI filters into our filter state.
    //  - sport      → selectedSport dropdown
    //  - city       → searchQuery (existing client-side substring filter against f.city)
    //  - date       → day-of-week int (facility_hours uses 0=Mon)
    //  - time_of_day → time window passed to the RPC's facility_hours overlap check
    const TIME_WINDOWS: Record<string, { start: string; end: string }> = {
        morning: { start: "06:00", end: "12:00" },
        afternoon: { start: "12:00", end: "17:00" },
        evening: { start: "17:00", end: "22:00" },
    };
    const TIME_LABELS: Record<string, string> = {
        morning: t("ai_time_morning"),
        afternoon: t("ai_time_afternoon"),
        evening: t("ai_time_evening"),
    };
    const DAY_LABELS = [
        t("ai_day_mon"), t("ai_day_tue"), t("ai_day_wed"),
        t("ai_day_thu"), t("ai_day_fri"), t("ai_day_sat"), t("ai_day_sun"),
    ];

    function applyAiFilters(filters: {
        sport?: string | null;
        city?: string | null;
        date?: string | null;
        time_of_day?: string | null;
    }) {
        const parts: string[] = [];

        if (filters.sport) {
            const match = sports.find((s) => s.name.toLowerCase() === filters.sport!.toLowerCase());
            if (match) {
                setSelectedSport(match.id);
                parts.push(sportName(match.name));
            }
        }

        if (filters.city) {
            setSearchQuery(filters.city);
            parts.push(filters.city);
        }

        let dow: number | null = null;
        if (filters.date) {
            const parsed = new Date(`${filters.date}T00:00:00`);
            if (!Number.isNaN(parsed.getTime())) {
                // JS getDay: 0=Sun..6=Sat → schema: 0=Mon..6=Sun
                dow = (parsed.getDay() + 6) % 7;
                setDayOfWeekFilter(dow);
                parts.push(DAY_LABELS[dow]);
            }
        }

        if (filters.time_of_day && TIME_WINDOWS[filters.time_of_day]) {
            const window = TIME_WINDOWS[filters.time_of_day];
            setTimeWindow(window);
            parts.push(TIME_LABELS[filters.time_of_day]);
            // Time-of-day only makes sense with a day. If the AI gave time
            // but no date, infer "today" so the RPC still narrows.
            if (dow === null && !filters.date) {
                const today = (new Date().getDay() + 6) % 7;
                setDayOfWeekFilter(today);
            }
        }

        setAiLabel(parts.length > 0 ? parts.join(" · ") : null);
    }

    function clearAiFilters() {
        setSelectedSport(null);
        setSearchQuery("");
        setDayOfWeekFilter(null);
        setTimeWindow(null);
        setAiLabel(null);
    }

    // Sidebar content is rendered once and slotted into both layouts
    // (mobile bottom-sheet + desktop side-by-side) so search/filters/list
    // logic stays in sync.
    const sidebarContent = (
        <>
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 space-y-3">
                <h1 className="font-bold text-lg text-gray-900 dark:text-white hidden md:block">{t("title")}</h1>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    <input
                        type="search"
                        placeholder={t("search_placeholder")}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full ps-9 pe-4 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                </div>

                {/* SAH-41: AI search — parses free text into sport/city/date/time-of-day
                    and applies all four to the existing filters. */}
                {!aiHidden && searchQuery.trim().length >= 4 && (
                    <button
                        type="button"
                        disabled={aiPending}
                        onClick={async () => {
                            setAiPending(true);
                            try {
                                const res = await parseSearchQueryAction(searchQuery);
                                if ("notConfigured" in res && res.notConfigured) {
                                    setAiHidden(true);
                                    return;
                                }
                                if ("filters" in res && res.filters) {
                                    applyAiFilters(res.filters);
                                }
                            } finally {
                                setAiPending(false);
                            }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 disabled:opacity-50 transition-colors"
                    >
                        {aiPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {aiPending ? t("ai_thinking") : t("ai_search")}
                    </button>
                )}

                {/* SAH-41: AI applied-filters chip with clear button. */}
                {aiLabel && (
                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-xs text-emerald-800 dark:text-emerald-200">
                        <span className="truncate">
                            <Sparkles className="inline h-3 w-3 me-1" />
                            {aiLabel}
                        </span>
                        <button
                            type="button"
                            onClick={clearAiFilters}
                            aria-label={t("ai_clear")}
                            className="shrink-0 rounded-full p-0.5 hover:bg-emerald-200 dark:hover:bg-emerald-800/50"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </div>
                )}

                {/* Sport filter */}
                <select
                    value={selectedSport ?? ""}
                    onChange={(e) => setSelectedSport(e.target.value ? Number(e.target.value) : null)}
                    className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                    <option value="">{t("filter_sport")}</option>
                    {sports.map((s) => (
                        <option key={s.id} value={s.id}>
                            {sportName(s.name)}
                        </option>
                    ))}
                </select>

                {/* SAH-143: prayer-friendly filter */}
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={prayerFriendlyOnly}
                        onChange={(e) => setPrayerFriendlyOnly(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    {t("prayer_friendly_filter")}
                </label>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 overscroll-contain">
                {loading && (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                    </div>
                )}

                {!loading && filteredFacilities.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8 px-4">
                        {t("no_results")}
                    </p>
                )}

                {filteredFacilities.map((facility) => {
                    const isSelected = selectedFacility?.id === facility.id;
                    return (
                        <div
                            key={facility.id}
                            className={`transition-colors ${isSelected ? "bg-emerald-50 dark:bg-emerald-900/20" : ""}`}
                        >
                            <button
                                type="button"
                                onClick={() => onSelectFacility(facility)}
                                className="w-full text-left px-4 pt-3 pb-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            >
                                <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{facility.name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{facility.city}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    {facility.distance_m && (
                                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                            {(facility.distance_m / 1000).toFixed(1)} {t("km_away")}
                                        </p>
                                    )}
                                    {(facility.has_prayer_room || facility.has_wudu_area) && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                            {t("prayer_friendly_chip")}
                                        </span>
                                    )}
                                </div>
                            </button>
                            {isSelected && (
                                <div className="px-4 pb-3">
                                    <Link
                                        href={`/${locale}/facilities/${facility.id}`}
                                        className="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors"
                                    >
                                        {t("details_button")}
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    </Link>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            {isOutsideUAE && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-sm shrink-0">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>{t("outside_uae")}</span>
                </div>
            )}

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
                {/* ── Desktop / tablet sidebar (md+) ─────────────────────── */}
                <aside className="hidden md:flex w-72 lg:w-96 bg-white dark:bg-gray-900 border-e border-gray-200 dark:border-gray-800 flex-col shrink-0 overflow-hidden">
                    {sidebarContent}
                </aside>

                {/* ── Map (always rendered; full screen on mobile) ───────── */}
                <div className="flex-1 min-h-64 relative">
                    <MapContainer
                        facilities={filteredFacilities}
                        userLat={userLat}
                        userLng={userLng}
                        selectedFacility={selectedFacility}
                        onSelectFacility={onSelectFacility}
                    />
                    {/* Selected-facility callout — only on mobile when the sheet
                        is collapsed. Anchored to the bottom of the map area so
                        it sits just above the sheet handle. */}
                    {selectedFacility && !sheetExpanded && (
                        <div className="md:hidden absolute inset-x-3 bottom-[7rem] z-20 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-lg p-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{selectedFacility.name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{selectedFacility.city}</p>
                            </div>
                            <Link
                                href={`/${locale}/facilities/${selectedFacility.id}`}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 shrink-0"
                            >
                                {t("details_button")}
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    )}
                </div>

                {/* ── Mobile bottom sheet ────────────────────────────────── */}
                {/* Backdrop dims the map slightly when the sheet is expanded
                    so the focus shifts to the list. Click-through to map taps
                    is preserved by hiding it when collapsed. */}
                {sheetExpanded && (
                    <button
                        type="button"
                        aria-label="Collapse list"
                        onClick={() => setSheetExpanded(false)}
                        className="md:hidden absolute inset-0 z-20 bg-black/20 backdrop-blur-[1px]"
                    />
                )}
                <aside
                    className={`md:hidden absolute inset-x-0 bottom-0 z-30 flex flex-col bg-white dark:bg-gray-900 rounded-t-2xl border-t border-x border-gray-200 dark:border-gray-800 shadow-2xl transition-transform duration-300 ease-out`}
                    style={{
                        // Sheet is always full-height. We translate it down so
                        // only the handle + count chip peek above the bottom edge.
                        // 100% - 6rem keeps roughly 96px visible in peek state.
                        height: "calc(100% - 1rem)",
                        transform: sheetExpanded ? "translateY(0)" : "translateY(calc(100% - 6rem))",
                    }}
                >
                    {/* Drag handle / toggle bar */}
                    <button
                        type="button"
                        onClick={() => setSheetExpanded((v) => !v)}
                        className="flex flex-col items-center justify-center gap-1 px-4 py-3 shrink-0 cursor-pointer"
                        aria-label={sheetExpanded ? t("view_map") : t("view_list")}
                        aria-expanded={sheetExpanded}
                    >
                        <span className="block w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                            <ChevronUp
                                className={`h-4 w-4 transition-transform ${sheetExpanded ? "rotate-180" : ""}`}
                            />
                            <span>{t("title")}</span>
                            <span className="text-xs text-gray-400">({filteredFacilities.length})</span>
                        </div>
                    </button>

                    <div className="flex-1 flex flex-col overflow-hidden">
                        {sidebarContent}
                    </div>
                </aside>
            </div>
        </div>
    );
}
