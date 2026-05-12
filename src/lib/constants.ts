// SAH-154: shared, compile-time constants. UI + product values that
// don't need runtime swapping (those go to `platform_settings` instead).
//
// Adding a value here means: a literal was duplicated 2+ times, or
// a magic number was naked in product code. The goal is one source
// of truth per concept — easy to grep, easy to change.

/** Page size for admin tables. Six admin pages used to declare this inline. */
export const ADMIN_PAGE_SIZE = 50;

/** "Recently added" rail size on the admin home dashboard. */
export const ADMIN_RECENT_ITEMS_LIMIT = 8;

/** Default page size for the public REST v1 API. */
export const API_LIMIT_DEFAULT = 20;

/** Maximum page size the public REST v1 API will honor. */
export const API_LIMIT_MAX = 100;

/** Maximum length for a review comment body. */
export const MAX_REVIEW_COMMENT_LENGTH = 1000;

/** Maximum length for a single chat message (matchmaking + DMs). */
export const MAX_MESSAGE_LENGTH = 2000;

/** Cookie retention for consent + facility-switcher cookies, in days. */
export const COOKIE_RETENTION_DAYS = 365;

/** Recurring-booking week options surfaced in the BookingWidget. */
export const RECURRING_WEEKS = [1, 2, 4, 8, 12] as const;

/** Recent-facilities cookie cap (SAH-122). */
export const RECENT_FACILITIES_MAX = 5;

/**
 * Customer-facing brand name. Surfaces in PDFs, emails, OpenGraph
 * metadata, and the OpenAPI contact card. Single source so a future
 * white-label / co-brand effort only needs to change one constant
 * (or set `NEXT_PUBLIC_BRAND_NAME`).
 */
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Saha";
