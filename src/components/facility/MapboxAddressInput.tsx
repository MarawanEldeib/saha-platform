"use client";

/**
 * SAH-119: Mapbox address autocomplete.
 *
 * Replaces the free-text address + city inputs with a single address field
 * that surfaces Mapbox suggestions as the owner types. On selection the
 * component:
 *
 *   1. Populates `address` (from the feature's `text`) and `city` (from
 *      the feature's `context.place.text` or first `place`-typed context).
 *   2. Hands back the WKT `POINT(lng lat)` so the parent can submit it as
 *      `location_wkt` to the server action and skip the server-side geocode
 *      round-trip entirely.
 *
 * Free-typing is still allowed. If the user types an address and submits
 * without selecting a suggestion, the server action falls back to the
 * existing `geocodeAddress()` path and — per SAH-119's soft-gate — saves
 * the row regardless, with a non-blocking warning when the address can't
 * be located.
 *
 * Country filter comes from `getActiveRegion().geocodingCountry` — same
 * source the server-side `geocodeAddress()` uses, so dev/staging behaviour
 * stays consistent.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { MapPin, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/Input";

interface MapboxFeature {
    id: string;
    text: string;
    place_name: string;
    place_type: string[];
    geometry: { coordinates: [number, number] };
    context?: Array<{ id: string; text: string }>;
}

export interface MapboxSelection {
    address: string;
    city: string;
    /** PostGIS WKT `POINT(lng lat)` ready to insert into facilities.location. */
    wkt: string;
}

interface Props {
    /** Two-letter ISO 3166 country code Mapbox restricts the search to. */
    country?: string;
    /** Initial address value (e.g. when editing an existing facility). */
    defaultAddress?: string;
    /** Initial city value. */
    defaultCity?: string;
    /** Fires when the user picks a suggestion. Free-typed values don't fire. */
    onSelect?: (selection: MapboxSelection) => void;
    /** Fires on every keystroke in the address field. */
    onAddressChange?: (value: string) => void;
    /** Fires on every keystroke in the city field. */
    onCityChange?: (value: string) => void;
    /** Inline error text under the address input. */
    addressError?: string;
    /** Inline error text under the city input. */
    cityError?: string;
    /** Hidden when Mapbox isn't configured client-side. */
    disabled?: boolean;
}

const PLACE_TYPE_PRIORITIES = ["place", "locality", "district", "region"];

function pickCityFromContext(feature: MapboxFeature): string {
    if (!feature.context) return "";
    for (const type of PLACE_TYPE_PRIORITIES) {
        const match = feature.context.find((c) => c.id.startsWith(`${type}.`));
        if (match) return match.text;
    }
    return "";
}

export function MapboxAddressInput({
    country = "ae",
    defaultAddress = "",
    defaultCity = "",
    onSelect,
    onAddressChange,
    onCityChange,
    addressError,
    cityError,
    disabled = false,
}: Props) {
    const t = useTranslations("facility_form");
    const [address, setAddress] = React.useState(defaultAddress);
    const [city, setCity] = React.useState(defaultCity);
    const [suggestions, setSuggestions] = React.useState<MapboxFeature[]>([]);
    const [open, setOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [activeIndex, setActiveIndex] = React.useState(-1);
    const wrapperRef = React.useRef<HTMLDivElement | null>(null);
    const debounceRef = React.useRef<number | null>(null);

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const enabled = Boolean(token) && !disabled;

    React.useEffect(() => {
        function onDocClick(e: MouseEvent) {
            if (!wrapperRef.current) return;
            if (!wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

    function runSearch(query: string) {
        if (!token) return;
        const trimmed = query.trim();
        if (trimmed.length < 3) {
            setSuggestions([]);
            setOpen(false);
            return;
        }
        setLoading(true);
        const encoded = encodeURIComponent(trimmed);
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${token}&autocomplete=true&country=${country}&limit=5&types=address,poi,place,locality`;
        fetch(url)
            .then((r) => r.json())
            .then((data) => {
                const features = (data?.features ?? []) as MapboxFeature[];
                setSuggestions(features);
                setOpen(features.length > 0);
                setActiveIndex(-1);
            })
            .catch(() => {
                setSuggestions([]);
                setOpen(false);
            })
            .finally(() => setLoading(false));
    }

    function handleAddressInput(value: string) {
        setAddress(value);
        onAddressChange?.(value);
        if (!enabled) return;
        if (debounceRef.current) window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => runSearch(value), 280);
    }

    function pickFeature(feature: MapboxFeature) {
        const newAddress = feature.text || feature.place_name;
        const newCity = pickCityFromContext(feature);
        setAddress(newAddress);
        if (newCity) setCity(newCity);
        onAddressChange?.(newAddress);
        if (newCity) onCityChange?.(newCity);
        setOpen(false);
        setSuggestions([]);
        const [lng, lat] = feature.geometry.coordinates;
        onSelect?.({
            address: newAddress,
            city: newCity || city,
            wkt: `POINT(${lng} ${lat})`,
        });
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (!open || suggestions.length === 0) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && activeIndex >= 0) {
            e.preventDefault();
            pickFeature(suggestions[activeIndex]);
        } else if (e.key === "Escape") {
            setOpen(false);
        }
    }

    function clear() {
        setAddress("");
        onAddressChange?.("");
        setSuggestions([]);
        setOpen(false);
    }

    return (
        <div className="space-y-3" ref={wrapperRef}>
            {/* Address — autocompletes */}
            <div className="relative">
                <label htmlFor="address-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("address_label")}
                </label>
                <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    <Input
                        id="address-input"
                        autoComplete="off"
                        value={address}
                        onChange={(e) => handleAddressInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={() => suggestions.length > 0 && setOpen(true)}
                        placeholder={t("address_placeholder")}
                        className="pl-9 pr-9"
                        error={addressError}
                        aria-autocomplete="list"
                        aria-expanded={open}
                        aria-controls="address-suggestions"
                    />
                    {loading && (
                        <Loader2 className="absolute right-3 top-9 h-4 w-4 text-gray-400 animate-spin" />
                    )}
                    {!loading && address && (
                        <button
                            type="button"
                            onClick={clear}
                            aria-label={t("address_clear")}
                            className="absolute right-3 top-9 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
                {enabled && open && suggestions.length > 0 && (
                    <ul
                        id="address-suggestions"
                        role="listbox"
                        className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-72 overflow-y-auto"
                    >
                        {suggestions.map((feature, idx) => (
                            <li key={feature.id} role="option" aria-selected={idx === activeIndex}>
                                <button
                                    type="button"
                                    onClick={() => pickFeature(feature)}
                                    onMouseEnter={() => setActiveIndex(idx)}
                                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${
                                        idx === activeIndex ? "bg-emerald-50 dark:bg-emerald-900/30" : ""
                                    }`}
                                >
                                    <div className="font-medium text-gray-900 dark:text-white truncate">
                                        {feature.text}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        {feature.place_name}
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {!enabled && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        {t("address_autocomplete_disabled")}
                    </p>
                )}
            </div>

            {/* City — auto-populated when a suggestion is picked, manually editable */}
            <div>
                <label htmlFor="city-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("city_label")}
                </label>
                <Input
                    id="city-input"
                    value={city}
                    onChange={(e) => {
                        setCity(e.target.value);
                        onCityChange?.(e.target.value);
                    }}
                    placeholder={t("city_placeholder")}
                    error={cityError}
                />
            </div>
        </div>
    );
}
