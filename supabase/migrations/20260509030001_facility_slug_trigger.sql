-- =============================================================================
-- SAH-89 follow-up: auto-fill facilities.slug on INSERT when not provided.
-- Required because the onboarding flow inserts without a slug; the previous
-- migration set the column NOT NULL.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.facilities_set_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    base TEXT;
    candidate TEXT;
    n INT := 0;
BEGIN
    IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN
        RETURN NEW;
    END IF;

    base := public.slugify(NEW.name);
    IF base = '' THEN base := 'facility'; END IF;
    candidate := base;

    WHILE EXISTS (SELECT 1 FROM public.facilities WHERE slug = candidate AND id <> NEW.id) LOOP
        n := n + 1;
        IF n = 1 AND NEW.city IS NOT NULL THEN
            candidate := base || '-' || public.slugify(NEW.city);
        ELSE
            candidate := base || '-' || n::TEXT;
        END IF;
    END LOOP;

    NEW.slug := candidate;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS facilities_set_slug ON public.facilities;

CREATE TRIGGER facilities_set_slug
    BEFORE INSERT ON public.facilities
    FOR EACH ROW
    EXECUTE FUNCTION public.facilities_set_slug();
