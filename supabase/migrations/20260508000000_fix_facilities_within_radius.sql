-- =============================================================================
-- SAH-69: Redefine facilities_within_radius() without the dropped
-- student_discounts table. The previous version (in 001_initial_schema.sql)
-- joins public.student_discounts which was dropped in
-- 20260507140000_drop_student_discounts.sql. Every map RPC call has been
-- erroring at runtime since that drop.
-- =============================================================================

DROP FUNCTION IF EXISTS public.facilities_within_radius(
    DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT, BOOLEAN
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
    distance_m DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        f.id, f.name, f.description, f.address, f.city,
        f.location, f.status,
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
