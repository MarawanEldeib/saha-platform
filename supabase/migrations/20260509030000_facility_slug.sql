-- =============================================================================
-- SAH-89: branded booking pages — facilities get a stable, brand-friendly slug
-- they can share on social. Backfilled from existing names; collisions
-- resolved by appending the city slug, then a numeric suffix.
-- =============================================================================

ALTER TABLE public.facilities
    ADD COLUMN IF NOT EXISTS slug TEXT;

-- Helper to slugify text → ASCII kebab-case (best-effort; PostgreSQL has no
-- built-in transliteration, so we lowercase, drop non-alphanumerics, collapse
-- runs of '-').
CREATE OR REPLACE FUNCTION public.slugify(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT trim(both '-' FROM
        regexp_replace(
            lower(regexp_replace(coalesce(input, ''), '[^a-zA-Z0-9]+', '-', 'g')),
            '-+', '-', 'g'
        )
    );
$$;

-- Backfill: name first, then name+city if a name-only slug collides.
DO $$
DECLARE
    f RECORD;
    base TEXT;
    candidate TEXT;
    n INT;
BEGIN
    FOR f IN SELECT id, name, city FROM public.facilities WHERE slug IS NULL LOOP
        base := public.slugify(f.name);
        IF base = '' THEN base := 'facility'; END IF;

        candidate := base;
        n := 0;
        WHILE EXISTS (SELECT 1 FROM public.facilities WHERE slug = candidate AND id <> f.id) LOOP
            n := n + 1;
            IF n = 1 AND f.city IS NOT NULL THEN
                candidate := base || '-' || public.slugify(f.city);
            ELSE
                candidate := base || '-' || n::TEXT;
            END IF;
        END LOOP;

        UPDATE public.facilities SET slug = candidate WHERE id = f.id;
    END LOOP;
END$$;

-- Now enforce: every active facility must have a unique slug.
ALTER TABLE public.facilities
    ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_facilities_slug ON public.facilities(slug);
