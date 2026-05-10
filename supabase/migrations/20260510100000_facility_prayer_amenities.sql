-- SAH-143 (Phase B): facility prayer amenities.
--
-- Adds two boolean facility flags surfaced as a "Prayer-friendly" badge
-- on the facility detail page and the map sidebar. The RPC used by /map
-- (facilities_within_radius) is redefined to return these columns so the
-- map sidebar can render the badge without a second round-trip per row.

ALTER TABLE public.facilities
    ADD COLUMN has_prayer_room BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN has_wudu_area   BOOLEAN NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.facilities_within_radius(
    DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT
);

CREATE OR REPLACE FUNCTION public.facilities_within_radius(
    lat        DOUBLE PRECISION,
    lng        DOUBLE PRECISION,
    radius_km  DOUBLE PRECISION DEFAULT 10,
    sport_filter INT DEFAULT NULL
)
RETURNS TABLE (
    id UUID, name TEXT, description TEXT, address TEXT, city TEXT,
    location GEOGRAPHY, status public.facility_status,
    has_prayer_room BOOLEAN, has_wudu_area BOOLEAN,
    distance_m DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        f.id, f.name, f.description, f.address, f.city,
        f.location, f.status,
        f.has_prayer_room, f.has_wudu_area,
        ST_Distance(f.location, ST_MakePoint(lng, lat)::GEOGRAPHY) AS distance_m
    FROM public.facilities f
    WHERE
        f.status = 'active'
        AND ST_DWithin(
            f.location,
            ST_MakePoint(lng, lat)::GEOGRAPHY,
            radius_km * 1000
        )
        AND (sport_filter IS NULL OR EXISTS (
            SELECT 1 FROM public.facility_sports fs
            WHERE fs.facility_id = f.id AND fs.sport_id = sport_filter
        ))
    ORDER BY distance_m ASC;
$$;
