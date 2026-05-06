"use client";

import React from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { Search, SlidersHorizontal, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { Sport } from "@/types/database";

// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(
    () => import("@/components/map/LeafletMap"),
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
    lat?: number;
    lng?: number;
}

export default function MapPage() {
    const t = useTranslations("map");

    const [sports, setSports] = React.useState<Sport[]>([]);
    const [facilities, setFacilities] = React.useState<FacilityResult[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [selectedSport, setSelectedSport] = React.useState<number | null>(null);
    const [discountOnly, setDiscountOnly] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const [userLat, setUserLat] = React.useState(48.7758); // Default: Stuttgart
    const [userLng, setUserLng] = React.useState(9.1829);
    const [selectedFacility, setSelectedFacility] = React.useState<FacilityResult | null>(null);

    // Fetch sports for filter
    React.useEffect(() => {
        const fetchSports = async () => {
            const supabase = createClient();
            const { data } = await supabase.from("sports").select("*").order("name");
            if (data) setSports(data);
        };
        fetchSports();

        // Try to get user location
        navigator.geolocation?.getCurrentPosition(
            (pos) => {
                setUserLat(pos.coords.latitude);
                setUserLng(pos.coords.longitude);
            },
            () => { } // Fail silently — default to Stuttgart
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
                discount_only: discountOnly,
            });

            if (!error && data) {
                // Parse lat/lng from PostGIS geography text
                const withCoords = data.map((f: FacilityResult) => {
                    // location comes as GeoJSON or text — we store raw and parse in the map component
                    return f;
                });
                setFacilities(withCoords);
            }
            setLoading(false);
        };

        fetchFacilities();
    }, [userLat, userLng, selectedSport, discountOnly]);

    const filteredFacilities = searchQuery
        ? facilities.filter(
            (f) =>
                f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                f.city.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : facilities;

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col md:flex-row">
            {/* ── Sidebar ─────────────────────────────────────────────── */}
            <aside className="w-full md:w-80 lg:w-96 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col shrink-0 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-800 space-y-3">
                    <h1 className="font-bold text-lg text-gray-900 dark:text-white">{t("title")}</h1>

                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        <input
                            type="search"
                            placeholder={t("search_placeholder")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </div>

                    {/* Filters */}
                    <div className="flex gap-2">
                        <select
                            value={selectedSport ?? ""}
                            onChange={(e) => setSelectedSport(e.target.value ? Number(e.target.value) : null)}
                            className="flex-1 min-w-0 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                            <option value="">{t("filter_sport")}</option>
                            {sports.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>

                        <Button
                            variant={discountOnly ? "primary" : "outline"}
                            size="sm"
                            onClick={() => setDiscountOnly(!discountOnly)}
                            className="shrink-0 text-xs"
                            title={t("filter_discount")}
                        >
                            <SlidersHorizontal className="h-4 w-4" />
                        </Button>
                    </div>

                    {discountOnly && (
                        <Badge variant="success" className="text-xs">
                            {t("filter_discount")}
                        </Badge>
                    )}
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

                    {filteredFacilities.map((facility) => (
                        <button
                            key={facility.id}
                            type="button"
                            onClick={() => setSelectedFacility(facility)}
                            className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${selectedFacility?.id === facility.id ? "bg-emerald-50 dark:bg-emerald-900/20" : ""
                                }`}
                        >
                            <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{facility.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{facility.city}</p>
                            {facility.distance_m && (
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                                    {(facility.distance_m / 1000).toFixed(1)} km away
                                </p>
                            )}
                        </button>
                    ))}
                </div>
            </aside>

            {/* ── Map ─────────────────────────────────────────────────── */}
            <div className="flex-1 min-h-64">
                <MapContainer
                    facilities={filteredFacilities}
                    userLat={userLat}
                    userLng={userLng}
                    selectedFacility={selectedFacility}
                    onSelectFacility={setSelectedFacility}
                />
            </div>
        </div>
    );
}
