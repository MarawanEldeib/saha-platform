-- =============================================================================
-- SAH-41: Extend facilities_within_radius() with day-of-week + time-window
-- filters so the natural-language search ("padel Saturday morning") can
-- narrow results to facilities actually open at the requested window.
--
-- Previous signature parsed sport only; date and time_of_day were extracted
-- by the client AI parser and silently discarded. Adding three optional
-- parameters keeps the function backwards compatible — existing callers
-- (PostgREST passes only the named args they care about).
-- =============================================================================

DROP FUNCTION IF EXISTS public.facilities_within_radius(
    DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT
);

CREATE OR REPLACE FUNCTION public.facilities_within_radius(
    lat                 DOUBLE PRECISION,
    lng                 DOUBLE PRECISION,
    radius_km           DOUBLE PRECISION DEFAULT 10,
    sport_filter        INT              DEFAULT NULL,
    day_of_week_filter  INT              DEFAULT NULL,
    time_window_start   TIME             DEFAULT NULL,
    time_window_end     TIME             DEFAULT NULL
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
        -- facility_hours.day_of_week: 0=Monday .. 6=Sunday (see 001_initial_schema.sql).
        -- Caller converts JS Date.getDay() (0=Sunday) before passing.
        AND (
            day_of_week_filter IS NULL
            OR EXISTS (
                SELECT 1 FROM public.facility_hours fh
                WHERE fh.facility_id = f.id
                  AND fh.day_of_week = day_of_week_filter
                  AND fh.is_closed = false
                  AND (
                      time_window_start IS NULL
                      OR time_window_end IS NULL
                      OR (
                          fh.open_time IS NOT NULL
                          AND fh.close_time IS NOT NULL
                          AND fh.open_time  < time_window_end
                          AND fh.close_time > time_window_start
                      )
                  )
            )
        )
    ORDER BY distance_m ASC;
$$;
