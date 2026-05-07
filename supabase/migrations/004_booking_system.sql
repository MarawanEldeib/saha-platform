-- =============================================================================
-- Saha Platform – Booking System Schema (SAH-12)
-- Tables: courts, court_availability, bookings, payments, booking_guests
-- Run in Supabase SQL Editor after 001_initial_schema.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. New Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.booking_status AS ENUM (
  'pending',    -- awaiting payment
  'confirmed',  -- payment succeeded
  'cancelled',  -- cancelled by player or owner
  'completed',  -- booking date has passed, player checked in
  'no_show'     -- booking date passed, player did not show up
);

CREATE TYPE public.payment_status AS ENUM (
  'pending',
  'succeeded',
  'failed',
  'refunded'
);

-- ---------------------------------------------------------------------------
-- 2. Courts
-- Individual courts within a facility (e.g. "Padel Court A", "Tennis Court 1")
-- ---------------------------------------------------------------------------
CREATE TABLE public.courts (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id    UUID         NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  sport_id       INT          REFERENCES public.sports(id) ON DELETE SET NULL,
  name           TEXT         NOT NULL,
  capacity       INT          NOT NULL DEFAULT 2 CHECK (capacity >= 1),
  price_per_hour NUMERIC(10,2) NOT NULL CHECK (price_per_hour >= 0),
  is_active      BOOLEAN      NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_courts_facility ON public.courts(facility_id);
CREATE INDEX idx_courts_sport    ON public.courts(sport_id);

CREATE TRIGGER set_courts_updated_at
  BEFORE UPDATE ON public.courts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Court Availability
-- Time slots that facility owners open for booking
-- ---------------------------------------------------------------------------
CREATE TABLE public.court_availability (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id   UUID        NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  date       DATE        NOT NULL,
  start_time TIME        NOT NULL,
  end_time   TIME        NOT NULL,
  is_booked  BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_availability_times CHECK (end_time > start_time),
  UNIQUE (court_id, date, start_time)
);

CREATE INDEX idx_court_availability_court ON public.court_availability(court_id);
CREATE INDEX idx_court_availability_date  ON public.court_availability(date);
CREATE INDEX idx_court_availability_lookup ON public.court_availability(court_id, date, is_booked);

-- ---------------------------------------------------------------------------
-- 4. Bookings
-- Player reservations — one row per booking group
-- ---------------------------------------------------------------------------
CREATE TABLE public.bookings (
  id              UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  availability_id UUID                 NOT NULL REFERENCES public.court_availability(id) ON DELETE RESTRICT,
  court_id        UUID                 NOT NULL REFERENCES public.courts(id) ON DELETE RESTRICT,
  player_id       UUID                 NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date            DATE                 NOT NULL,
  start_time      TIME                 NOT NULL,
  end_time        TIME                 NOT NULL,
  num_players     INT                  NOT NULL DEFAULT 1 CHECK (num_players >= 1),
  total_price     NUMERIC(10,2)        NOT NULL CHECK (total_price >= 0),
  currency        TEXT                 NOT NULL DEFAULT 'AED',
  status          public.booking_status NOT NULL DEFAULT 'pending',
  qr_code_token   UUID                 NOT NULL DEFAULT gen_random_uuid(),
  notes           TEXT,
  created_at      TIMESTAMPTZ          NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ          NOT NULL DEFAULT now(),
  UNIQUE (qr_code_token)
);

CREATE INDEX idx_bookings_player    ON public.bookings(player_id);
CREATE INDEX idx_bookings_court     ON public.bookings(court_id);
CREATE INDEX idx_bookings_status    ON public.bookings(status);
CREATE INDEX idx_bookings_date      ON public.bookings(date);
CREATE INDEX idx_bookings_qr_token  ON public.bookings(qr_code_token);

CREATE TRIGGER set_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Payments
-- Stripe payment records linked to bookings
-- ---------------------------------------------------------------------------
CREATE TABLE public.payments (
  id                         UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                 UUID                  NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  stripe_payment_intent_id   TEXT                  UNIQUE,
  stripe_checkout_session_id TEXT                  UNIQUE,
  amount                     NUMERIC(10,2)         NOT NULL CHECK (amount >= 0),
  currency                   TEXT                  NOT NULL DEFAULT 'AED',
  status                     public.payment_status NOT NULL DEFAULT 'pending',
  created_at                 TIMESTAMPTZ           NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ           NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_booking ON public.payments(booking_id);

CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Booking Guests
-- Other players in the group (invited via shareable link)
-- ---------------------------------------------------------------------------
CREATE TABLE public.booking_guests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID        NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  name         TEXT,
  email        TEXT,
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX idx_booking_guests_booking ON public.booking_guests(booking_id);

-- ---------------------------------------------------------------------------
-- 7. Storage Bucket for Avatars
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatars_bucket_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "avatars_bucket_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND auth.uid() IS NOT NULL AND
    auth.uid()::TEXT = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars_bucket_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars' AND
    auth.uid()::TEXT = (storage.foldername(name))[1]
  );

-- ---------------------------------------------------------------------------
-- 8. Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.courts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.court_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_guests     ENABLE ROW LEVEL SECURITY;

-- --- courts ---
-- Anyone can read courts belonging to active facilities
CREATE POLICY "courts_select_public" ON public.courts
  FOR SELECT USING (
    is_active = true AND EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND f.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND f.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

CREATE POLICY "courts_manage_owner" ON public.courts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND (f.owner_id = auth.uid() OR public.is_admin())
    )
  );

-- --- court_availability ---
CREATE POLICY "availability_select_public" ON public.court_availability
  FOR SELECT USING (true);

CREATE POLICY "availability_manage_owner" ON public.court_availability
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.courts c
      JOIN public.facilities f ON f.id = c.facility_id
      WHERE c.id = court_id AND (f.owner_id = auth.uid() OR public.is_admin())
    )
  );

-- --- bookings ---
-- Players can see their own bookings; facility owners can see bookings on their courts; admins see all
CREATE POLICY "bookings_select" ON public.bookings
  FOR SELECT USING (
    player_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.courts c
      JOIN public.facilities f ON f.id = c.facility_id
      WHERE c.id = court_id AND f.owner_id = auth.uid()
    )
  );

CREATE POLICY "bookings_insert_authenticated" ON public.bookings
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND player_id = auth.uid()
  );

CREATE POLICY "bookings_update_player_or_owner" ON public.bookings
  FOR UPDATE USING (
    player_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.courts c
      JOIN public.facilities f ON f.id = c.facility_id
      WHERE c.id = court_id AND f.owner_id = auth.uid()
    )
  );

-- --- payments ---
CREATE POLICY "payments_select" ON public.payments
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND b.player_id = auth.uid()
    )
  );

-- Payments are inserted server-side only (service role key) — no INSERT policy needed for anon/user

-- --- booking_guests ---
CREATE POLICY "booking_guests_select" ON public.booking_guests
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND b.player_id = auth.uid()
    )
  );

CREATE POLICY "booking_guests_insert" ON public.booking_guests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND b.player_id = auth.uid()
    )
  );
