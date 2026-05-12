// SAH-154: regions registry + active-region resolver. Server code
// looks up a region either via `getActiveRegion()` (env-bound default)
// or — once `facilities.region_code` lands in Phase 2 of SAH-154 —
// via a per-facility lookup.

import { AE } from "./ae";
import type { RegionCode, RegionConfig } from "./types";

export type { RegionCode, RegionConfig };

/**
 * Registry of all configured regions. Keys are `RegionCode` ISO 3166-1
 * alpha-2 strings. Adding a region: drop a `xx.ts` next to `ae.ts`,
 * export the const, register it here.
 */
export const REGIONS: Partial<Record<RegionCode, RegionConfig>> = {
    AE,
};

/**
 * Resolve the active region. Reads `SAHA_DEFAULT_REGION` from env when set,
 * otherwise falls back to `AE`. Throws if the requested code isn't
 * registered — surfaces a config error loudly instead of silently
 * defaulting to UAE behaviour in production.
 */
export function getActiveRegion(): RegionConfig {
    const envCode = process.env.SAHA_DEFAULT_REGION as RegionCode | undefined;
    const code = envCode ?? "AE";
    const region = REGIONS[code];
    if (!region) {
        throw new Error(
            `SAH-154: SAHA_DEFAULT_REGION="${code}" is not a registered region. Available: ${Object.keys(REGIONS).join(", ")}`,
        );
    }
    return region;
}

/** Look up a specific region by code. Returns null when not registered. */
export function getRegion(code: RegionCode): RegionConfig | null {
    return REGIONS[code] ?? null;
}

/** Convenience: locale RTL check that scales beyond binary en/ar. */
export function isLocaleRTL(locale: string): boolean {
    return ["ar", "he", "fa", "ur"].includes(locale);
}
