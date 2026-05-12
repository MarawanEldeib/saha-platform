-- =============================================================================
-- SAH-152 Phase 7: duration_minutes drives the Live pill + auto-complete.
-- A match goes "live" between scheduled_for and scheduled_for + duration_minutes,
-- then auto-completes via a cron job (see /api/cron/auto-complete-matches).
-- =============================================================================

ALTER TABLE public.matchmaking_posts
    ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 60;

ALTER TABLE public.matchmaking_posts
    DROP CONSTRAINT IF EXISTS matches_duration_check;
ALTER TABLE public.matchmaking_posts
    ADD CONSTRAINT matches_duration_check CHECK (duration_minutes BETWEEN 15 AND 480);
