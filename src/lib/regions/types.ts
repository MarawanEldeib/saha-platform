// SAH-154: region descriptor for multi-country support. Today only UAE
// is registered; adding KSA / EG / etc means adding a file in this
// directory and an entry to the registry. No code outside `src/lib/regions/`
// should reference a country/currency literal directly — go through the
// active region instead.

export type RegionCode = "AE" | "SA" | "EG";

export interface RegionConfig {
    code: RegionCode;
    /** Display name (English). */
    displayName: string;
    /** ISO 4217 currency code, uppercase. */
    currency: string;
    /** Decimal VAT rate (e.g. 0.05 = 5%). */
    vatRate: number;
    /** Human label for the tax-ID input (e.g. "TRN"). */
    taxIdLabel: string;
    /** Regex matching valid tax-ID strings for this region. */
    taxIdPattern: RegExp;
    /** Sample phone for placeholder/error copy. */
    phoneExample: string;
    /** IANA timezone for date math + prayer times. */
    timezone: string;
    /** Aladhan API method id used by `src/lib/prayer-times.ts`. */
    prayerMethod: number;
    /** Two-letter ISO 3166 for Mapbox geocoding restriction. */
    geocodingCountry: string;
    /** Stripe Connect country code (two-letter, uppercase). */
    stripeCountry: string;
    /** Default map center + zoom when no user coordinates are known. */
    mapDefault: { lat: number; lng: number; zoom: number };
    /** Bounding box that flags "you're outside this region" warnings. */
    mapBounds: { latMin: number; latMax: number; lngMin: number; lngMax: number };
    /** Whether postal_code is required on facility addresses. */
    postalCodeRequired: boolean;
    /** Locales the region launches with (first = default). */
    locales: readonly string[];
}
