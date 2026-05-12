// SAH-122: shared cookie names + types for the functional-cookie layer.
// Both client and server helpers import from here so the cookie surface
// has one source of truth.

export const COOKIE = {
    CONSENT: "saha_cookie_consent",
    LAST_SEARCH: "saha_last_search",
    RECENT_FACILITIES: "saha_recent_facilities",
    RESUME_BOOKING: "saha_resume_booking",
    ONBOARDING_MAP: "saha_onboarding_map_seen",
    AB_BUCKET: "saha_ab_bucket",
} as const;

export type LastSearch = {
    sport_id: number | null;
    city: string | null;
};

export type ResumeBooking = {
    availability_id: string;
    num_players: number;
    facility_id: string;
    /** ISO string; ignored after this point so we don't surface stale bookings. */
    expires_at: string;
};

export const RECENT_FACILITIES_MAX = 5;
export const RESUME_BOOKING_TTL_HOURS = 24;
