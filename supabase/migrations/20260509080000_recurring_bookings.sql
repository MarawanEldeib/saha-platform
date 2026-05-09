-- SAH-91: tag bookings created as part of a weekly series so the player
-- can see them grouped and ops can run series-level reports. Nullable —
-- one-off bookings stay null. No FK; this is just a correlation id.
ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS recurring_group_id UUID;

CREATE INDEX IF NOT EXISTS bookings_recurring_group_id_idx
    ON public.bookings (recurring_group_id)
    WHERE recurring_group_id IS NOT NULL;
