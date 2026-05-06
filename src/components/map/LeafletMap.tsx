"use client";

import React from "react";
import { MapContainer as LeafletMap, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLocale } from "next-intl";

// Fix Leaflet's default marker icon path issue in Next.js
const defaultIcon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
});

const userIcon = L.divIcon({
    className: "user-marker",
    html: `<div style="width:16px;height:16px;background:#10b981;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
});

const selectedIcon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [30, 49],
    iconAnchor: [15, 49],
    popupAnchor: [1, -40],
    className: "marker-selected",
});

interface Facility {
    id: string;
    name: string;
    city: string;
    address: string;
    description: string | null;
    location: unknown;
    status: string;
    distance_m: number;
}

interface MapAutoCenter {
    lat: number;
    lng: number;
}

function MapAutoCenter({ lat, lng }: MapAutoCenter) {
    const map = useMap();
    React.useEffect(() => {
        map.setView([lat, lng], map.getZoom());
    }, [lat, lng, map]);
    return null;
}

interface LeafletMapProps {
    facilities: Facility[];
    userLat: number;
    userLng: number;
    selectedFacility: Facility | null;
    onSelectFacility: (f: Facility) => void;
}

/**
 * Parses a PostGIS geography column returned as a GeoJSON object.
 * Supabase returns geography as { type: 'Point', coordinates: [lng, lat] }
 */
function parseLocation(location: unknown): [number, number] | null {
    if (!location) return null;
    try {
        const geo = location as { type: string; coordinates: [number, number] };
        if (geo.type === "Point" && Array.isArray(geo.coordinates)) {
            return [geo.coordinates[1], geo.coordinates[0]]; // [lat, lng]
        }
    } catch { }
    return null;
}

export default function LeafletMapComponent({
    facilities,
    userLat,
    userLng,
    selectedFacility,
    onSelectFacility,
}: LeafletMapProps) {
    const locale = useLocale();

    return (
        <LeafletMap
            center={[userLat, userLng]}
            zoom={13}
            style={{ height: "100%", width: "100%" }}
            className="z-0"
        >
            <MapAutoCenter lat={userLat} lng={userLng} />

            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* User location marker */}
            <Marker position={[userLat, userLng]} icon={userIcon}>
                <Popup>
                    <span className="text-sm font-medium">Your Location</span>
                </Popup>
            </Marker>

            {/* Facility markers */}
            {facilities.map((facility) => {
                const coords = parseLocation(facility.location);
                if (!coords) return null;
                const isSelected = selectedFacility?.id === facility.id;

                return (
                    <Marker
                        key={facility.id}
                        position={coords}
                        icon={isSelected ? selectedIcon : defaultIcon}
                        eventHandlers={{ click: () => onSelectFacility(facility) }}
                    >
                        <Popup>
                            <div className="min-w-[160px]">
                                <p className="font-semibold text-gray-900 text-sm">{facility.name}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{facility.address}</p>
                                <a
                                    href={`/${locale}/facilities/${facility.id}`}
                                    className="inline-block mt-2 text-xs text-emerald-600 font-medium hover:underline"
                                >
                                    View Details →
                                </a>
                            </div>
                        </Popup>
                    </Marker>
                );
            })}
        </LeafletMap>
    );
}
