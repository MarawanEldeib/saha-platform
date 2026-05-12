// SAH-154: United Arab Emirates region config. The reference
// implementation — every other future region uses this as the
// template. Numbers come from the corresponding hardcoded literals
// that previously lived in `src/lib/platform-settings.ts`,
// `src/app/[locale]/map/page.tsx`, `src/lib/geocoding.ts`,
// `src/lib/pdf/render-invoice.ts`, `src/lib/validations.ts`,
// `src/lib/ramadan.ts`, and `src/app/api/stripe/connect/route.ts`.

import type { RegionConfig } from "./types";

export const AE: RegionConfig = {
    code: "AE",
    displayName: "United Arab Emirates",
    currency: "AED",
    vatRate: 0.05,
    taxIdLabel: "TRN",
    // 15-digit Tax Registration Number per UAE FTA spec.
    taxIdPattern: /^\d{15}$/,
    phoneExample: "+971501234567",
    timezone: "Asia/Dubai",
    // Aladhan method 8 = Gulf Region.
    prayerMethod: 8,
    geocodingCountry: "ae",
    stripeCountry: "AE",
    mapDefault: { lat: 25.2048, lng: 55.2708, zoom: 11 },
    mapBounds: { latMin: 22.63, latMax: 26.09, lngMin: 51.5, lngMax: 56.4 },
    // UAE addresses commonly omit postal code; we keep it optional.
    postalCodeRequired: false,
    locales: ["en", "ar"] as const,
};
