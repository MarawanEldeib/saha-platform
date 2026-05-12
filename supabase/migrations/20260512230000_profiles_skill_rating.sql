-- =============================================================================
-- SAH-152 Phase 8: self-reported skill rating (1.00 – 7.00).
-- Optional — null means "not rated yet"; the chip just hides in the UI.
-- =============================================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS skill_rating NUMERIC(3, 2);

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_skill_rating_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_skill_rating_check
    CHECK (skill_rating IS NULL OR (skill_rating >= 1.0 AND skill_rating <= 7.0));

-- Republish the public_profiles view so the new column is exposed.
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles AS
    SELECT id, display_name, avatar_url, role, no_show_count, skill_rating, created_at
    FROM public.profiles;
