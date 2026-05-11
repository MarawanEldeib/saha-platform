// SAH-141: typed reader for platform_settings rows.
//
// Settings live in Postgres so admins can hot-swap them via /admin/settings
// without a deploy. Each call site uses `getPlatformSetting(key, default)`
// or the typed shortcuts below. Reads are request-scoped via React.cache,
// so a single render only hits the table once even if many components
// read the same key.
//
// IMPORTANT: this util uses the service-role admin client. Don't call from
// client components — only Server Components, Server Actions, route
// handlers, and crons.

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PlatformSettingRow {
    key: string;
    value: unknown;
    updated_at: string;
    updated_by: string | null;
}

const DEFAULTS = {
    platform_fee_percent: 10,
    default_currency: "AED",
    min_booking_lead_minutes: 60,
    cancel_refund_window_hours: 24,
    loyalty_threshold: 10,
    feature_events: true,
    feature_community: true,
    feature_group_booking: true,
    feature_messaging: true,
} as const;

export type PlatformSettingKey = keyof typeof DEFAULTS;

// Request-scoped fetch of every setting at once. Cheaper than one-at-a-time
// reads because the table is tiny (<20 rows). React.cache() de-duplicates
// within a single request.
const fetchAll = cache(async (): Promise<Map<string, unknown>> => {
    try {
        const admin = createAdminClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (admin as any)
            .from("platform_settings")
            .select("key, value");
        const map = new Map<string, unknown>();
        for (const row of (data ?? []) as Array<{ key: string; value: unknown }>) {
            map.set(row.key, row.value);
        }
        return map;
    } catch (err) {
        console.error("[platform-settings] fetch failed, falling back to defaults", err);
        return new Map();
    }
});

export async function getPlatformSetting<K extends PlatformSettingKey>(
    key: K,
): Promise<(typeof DEFAULTS)[K]> {
    const all = await fetchAll();
    const raw = all.get(key);
    if (raw === undefined || raw === null) return DEFAULTS[key];
    return raw as (typeof DEFAULTS)[K];
}

export async function listPlatformSettings(): Promise<PlatformSettingRow[]> {
    try {
        const admin = createAdminClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (admin as any)
            .from("platform_settings")
            .select("key, value, updated_at, updated_by")
            .order("key");
        return (data ?? []) as PlatformSettingRow[];
    } catch {
        return [];
    }
}

export function platformSettingDefault<K extends PlatformSettingKey>(key: K): (typeof DEFAULTS)[K] {
    return DEFAULTS[key];
}

// Convenience: the most-read setting. Falls back to the env-time constant
// if the DB lookup fails so booking checkout never crashes.
export async function getPlatformFeePercent(): Promise<number> {
    return getPlatformSetting("platform_fee_percent");
}
