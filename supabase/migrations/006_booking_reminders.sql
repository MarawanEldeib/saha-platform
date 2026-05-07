ALTER TABLE public.bookings
    ADD COLUMN reminder_24h_sent BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN reminder_2h_sent  BOOLEAN NOT NULL DEFAULT false;
