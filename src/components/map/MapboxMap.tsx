"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";

interface Facility {
    id: string;
    name: string;
    city: string;
    address: string;
    description: string | null;
    location: unknown;
    status: string;
    distance_m: number;
    lat?: number;
    lng?: number;
}

interface MapboxMapProps {
    facilities: Facility[];
    userLat: number;
    userLng: number;
    selectedFacility: Facility | null;
    onSelectFacility: (f: Facility) => void;
}

type MapLib = typeof import("react-map-gl/maplibre");

function parseLocation(location: unknown): { lat: number; lng: number } | null {
    if (!location) return null;
    try {
        const geo = location as { type: string; coordinates: [number, number] };
        if (geo.type === "Point" && Array.isArray(geo.coordinates)) {
            return { lat: geo.coordinates[1], lng: geo.coordinates[0] };
        }
    } catch { }
    return null;
}

function useMapStyle() {
    const [isDark, setIsDark] = React.useState(false);
    React.useEffect(() => {
        const check = () => setIsDark(document.documentElement.classList.contains("dark"));
        check();
        const observer = new MutationObserver(check);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, []);
    return isDark
        ? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        : "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
}

export default function MapboxMapComponent({
    facilities,
    userLat,
    userLng,
    selectedFacility,
    onSelectFacility,
}: MapboxMapProps) {
    const locale = useLocale();
    const t = useTranslations("map");
    const mapStyle = useMapStyle();

    // Defer the entire react-map-gl/maplibre import to after mount so
    // maplibre-gl never touches the DOM during module initialisation.
    const [lib, setLib] = React.useState<MapLib | null>(null);

    const [viewState, setViewState] = React.useState({
        longitude: userLng,
        latitude: userLat,
        zoom: 12,
    });

    const [popupInfo, setPopupInfo] = React.useState<{
        facility: Facility;
        lat: number;
        lng: number;
    } | null>(null);

    React.useEffect(() => {
        import("react-map-gl/maplibre").then((mod) => setLib(mod));
    }, []);

    React.useEffect(() => {
        setViewState((prev) => ({ ...prev, longitude: userLng, latitude: userLat }));
    }, [userLat, userLng]);

    React.useEffect(() => {
        if (!selectedFacility) { setPopupInfo(null); return; }
        const coords = parseLocation(selectedFacility.location);
        if (!coords) return;
        setViewState((prev) => ({ ...prev, longitude: coords.lng, latitude: coords.lat, zoom: 15 }));
        setPopupInfo({ facility: selectedFacility, lat: coords.lat, lng: coords.lng });
    }, [selectedFacility]);

    if (!lib) return <div className="h-full bg-gray-100 dark:bg-gray-900" />;

    const { default: Map, Marker, Popup, NavigationControl } = lib;

    return (
        <Map
            {...viewState}
            onMove={(evt) => setViewState(evt.viewState)}
            style={{ width: "100%", height: "100%" }}
            mapStyle={mapStyle}
        >
            <NavigationControl position="top-right" />

            {/* User location dot */}
            <Marker longitude={userLng} latitude={userLat} anchor="center">
                <div
                    style={{
                        width: 16,
                        height: 16,
                        background: "#10b981",
                        border: "3px solid white",
                        borderRadius: "50%",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                    }}
                />
            </Marker>

            {/* Facility markers */}
            {facilities.map((facility) => {
                const coords = parseLocation(facility.location);
                if (!coords) return null;
                const isSelected = selectedFacility?.id === facility.id;

                return (
                    <Marker
                        key={facility.id}
                        longitude={coords.lng}
                        latitude={coords.lat}
                        anchor="bottom"
                        onClick={(e) => {
                            e.originalEvent.stopPropagation();
                            onSelectFacility(facility);
                            setPopupInfo({ facility, lat: coords.lat, lng: coords.lng });
                        }}
                    >
                        <div
                            style={{
                                width: isSelected ? 18 : 14,
                                height: isSelected ? 18 : 14,
                                background: isSelected ? "#059669" : "#10b981",
                                border: `${isSelected ? 3 : 2}px solid white`,
                                borderRadius: "50%",
                                boxShadow: isSelected
                                    ? "0 0 0 4px rgba(16,185,129,0.35), 0 2px 8px rgba(0,0,0,0.25)"
                                    : "0 2px 6px rgba(0,0,0,0.25)",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                            }}
                        />
                    </Marker>
                );
            })}

            {popupInfo && (
                <Popup
                    longitude={popupInfo.lng}
                    latitude={popupInfo.lat}
                    anchor="bottom"
                    offset={16}
                    onClose={() => setPopupInfo(null)}
                    closeOnClick={false}
                >
                    <div style={{ minWidth: 160, fontFamily: "inherit" }}>
                        <p style={{ fontWeight: 600, fontSize: 13, margin: 0, color: "#111827" }}>
                            {popupInfo.facility.name}
                        </p>
                        <p style={{ fontSize: 12, color: "#6b7280", margin: "3px 0 8px" }}>
                            {popupInfo.facility.address}
                        </p>
                        <a
                            href={`/${locale}/facilities/${popupInfo.facility.id}`}
                            style={{ fontSize: 12, color: "#059669", fontWeight: 500 }}
                        >
                            {t("details_button")} →
                        </a>
                    </div>
                </Popup>
            )}
        </Map>
    );
}
