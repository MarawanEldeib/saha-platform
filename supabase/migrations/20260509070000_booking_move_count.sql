-- SAH-88: track how many times a player has moved a booking. Limit is 1
-- enforced in the server action. Stored on the booking so we don't need a
-- separate audit table; audit_events still records the move event for ops.
ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS move_count SMALLINT NOT NULL DEFAULT 0;
