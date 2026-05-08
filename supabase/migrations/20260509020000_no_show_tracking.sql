-- =============================================================================
-- SAH-86: no-show automation. Schema has the booking_status='no_show' value
-- but no automation marks bookings as no-show. Without this, owners cannot
-- enforce penalties or surface no-show metrics — the #1 owner pain point.
--
-- This migration adds the per-player counter; the cron route applies the
-- transitions nightly.
-- =============================================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS no_show_count INT NOT NULL DEFAULT 0;
