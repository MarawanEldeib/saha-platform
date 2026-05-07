ALTER TABLE public.bookings
    ADD COLUMN reminder_sent BOOLEAN NOT NULL DEFAULT false;
