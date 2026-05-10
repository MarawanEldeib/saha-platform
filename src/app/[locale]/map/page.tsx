"use client";

import React from "react";
import { useTranslations, useLocale } from "next-intl";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { Search, Loader2, ChevronRight, MapPin, Map as MapIcon, List, Sparkles } from "lucide-react";
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
    // SAH-32: mobile-only view toggle. Side-by-side keeps the map cramped on
    // phones — give them the full screen for whichever view they want.
    const [mobileView, setMobileView] = React.useState<"map" | "list">("map");
    const [aiPending, setAiPending] = React.useState(false);
    const [aiHidden, setAiHidden] = React.useState(false);
    const [prayerFriendlyOnly, setPrayerFriendlyOnly] = React.useState(false);

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
            const { data, error } = await supabase.rpc("facilities_within_radius", {
                lat: userLat,
                lng: userLng,
                radius_km: 15,
                sport_filter: selectedSport,
            });

            if (!error && data) {
                setFacilities(data);
            }
            setLoading(false);
        };

        fetchFacilities();
    }, [userLat, userLng, selectedSport]);

    const filteredFacilities = facilities
        .filter((f) =>
            !searchQuery ||
            f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            f.city.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .filter((f) => !prayerFriendlyOnly || f.has_prayer_room || f.has_wudu_area);

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            {isOutsideUAE && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-sm shrink-0">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>{t("outside_uae")}</span>
                </div>
            )}

            {/* Mobile-only Map/List toggle (SAH-32) */}
            <div className="md:hidden flex justify-center p-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
                <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1 gap-1">
                    {([
                        { key: "map", label: t("view_map"), icon: MapIcon },
                        { key: "list", label: t("view_list"), icon: List },
                    ] as const).map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setMobileView(key)}
                            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                mobileView === key
                                    ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                            }`}
                        >
                            <Icon className="h-4 w-4" />
                            {label}
                            {key === "list" && filteredFacilities.length > 0 && (
                                <span className="text-xs text-gray-400">({filteredFacilities.length})</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
            {/* ── Sidebar ─────────────────────────────────────────────── */}
            <aside className={`${mobileView === "list" ? "flex" : "hidden"} md:flex w-full md:w-72 lg:w-96 bg-white dark:bg-gray-900 border-e border-gray-200 dark:border-gray-800 flex-col shrink-0 overflow-hidden`}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-800 space-y-3">
                    <h1 className="font-bold text-lg text-gray-900 dark:text-white">{t("title")}</h1>

                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        <input
                            type="search"
                            placeholder={t("search_placeholder")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full ps-9 pe-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </div>

                    {/* SAH-41: AI search — parses free-text into filters. Hidden when
                        ANTHROPIC_API_KEY isn't configured. */}
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
                                        const knownSport = sports.find((s) =>
                                            s.name.toLowerCase() === (res.filters!.sport ?? "").toLowerCase()
                                        );
                                        if (knownSport) setSelectedSport(knownSport.id);
                                    }
                                } finally {
                                    setAiPending(false);
                                }
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 disabled:opacity-50 transition-colors"
                        >
                            {aiPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                            {aiPending ? "Thinking…" : "AI search"}
                        </button>
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

                {/* Facility List */}
                <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
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
                                    onClick={() => setSelectedFacility(facility)}
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
            </aside>

            {/* ── Map ─────────────────────────────────────────────────── */}
            <div className={`${mobileView === "map" ? "flex" : "hidden"} md:flex flex-1 min-h-64 relative`}>
                <MapContainer
                    facilities={filteredFacilities}
                    userLat={userLat}
                    userLng={userLng}
                    selectedFacility={selectedFacility}
                    onSelectFacility={setSelectedFacility}
                />
                {/* Mobile selected-facility callout — auto-flips to list-context */}
                {selectedFacility && (
                    <div className="md:hidden absolute inset-x-3 bottom-3 z-10 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-lg p-3 flex items-center gap-3">
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
        </div>
        </div>
    );
}
