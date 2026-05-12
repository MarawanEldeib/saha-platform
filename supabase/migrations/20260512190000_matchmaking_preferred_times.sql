-- =============================================================================
-- SAH-152 (round 3): add preferred_times to matchmaking_posts so players can
-- say "weekday mornings" / "weekend evenings" without it being in free-text.
-- Drives a filter on the browse view + chips on the post card.
-- =============================================================================

ALTER TABLE public.matchmaking_posts
ADD COLUMN IF NOT EXISTS preferred_times TEXT[] NULL;

-- Optional sanity constraint — only accept the three slots we surface in UI.
-- Stored as TEXT[] (not enum) because the values are short, fixed, and we
-- want the simplest path to a multi-select.
ALTER TABLE public.matchmaking_posts
DROP CONSTRAINT IF EXISTS matchmaking_posts_preferred_times_check;

ALTER TABLE public.matchmaking_posts
ADD CONSTRAINT matchmaking_posts_preferred_times_check
CHECK (
    preferred_times IS NULL
    OR (
        cardinality(preferred_times) BETWEEN 1 AND 3
        AND preferred_times <@ ARRAY['morning', 'afternoon', 'evening']
    )
);
