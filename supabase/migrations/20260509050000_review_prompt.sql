-- =============================================================================
-- SAH-94: Track which bookings have already had a post-game review prompt
-- sent so the cron is idempotent. Reviews now require a completed booking
-- (SAH-83), so prompting after a booking ends drives conversion.
-- =============================================================================

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS review_prompt_sent_at TIMESTAMPTZ;
