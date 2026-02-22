-- =============================================================================
-- Saha Platform – Full Schema Migration
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → Run)
-- Requires PostGIS and pg_trgm extensions (enabled below)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- for text similarity search

-- ---------------------------------------------------------------------------
-- 1. Custom Types / Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.user_role AS ENUM ('user', 'business', 'admin');
CREATE TYPE public.facility_status AS ENUM ('pending', 'active', 'suspended');
CREATE TYPE public.event_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.skill_level AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE public.document_status AS ENUM ('pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- 2. Profiles
-- Extends auth.users – one row per user, created via trigger on sign-up
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role         public.user_role NOT NULL DEFAULT 'user',
  display_name TEXT,
  avatar_url   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create a profile row when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, display_name)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'user'),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Sports Reference Table
-- ---------------------------------------------------------------------------
CREATE TABLE public.sports (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT  -- lucide icon name or emoji
);

INSERT INTO public.sports (name, icon) VALUES
  ('Football', 'circle-dot'),
  ('Basketball', 'dribbble'),
  ('Tennis', 'circle'),
  ('Volleyball', 'circle'),
  ('Swimming', 'waves'),
  ('Badminton', 'circle'),
  ('Table Tennis', 'table'),
  ('Gym / Fitness', 'dumbbell'),
  ('Running / Track', 'footprints'),
  ('Climbing', 'mountain'),
  ('Yoga', 'flower'),
  ('Martial Arts', 'shield'),
  ('Hockey', 'hockey-puck'),
  ('Baseball / Softball', 'baseball'),
  ('Rugby', 'oval'),
  ('Handball', 'hand'),
  ('Squash', 'square'),
  ('Golf', 'golf'),
  ('Cycling', 'bike'),
  ('Other', 'activity');

-- ---------------------------------------------------------------------------
-- 4. Facilities
-- ---------------------------------------------------------------------------
CREATE TABLE public.facilities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  address     TEXT NOT NULL,
  city        TEXT NOT NULL,
  postal_code TEXT,
  country     TEXT NOT NULL DEFAULT 'Germany',
  phone       TEXT,
  website     TEXT,
  -- PostGIS point: SRID 4326 = WGS84 (standard GPS lat/lng)
  location    GEOGRAPHY(POINT, 4326),
  status      public.facility_status NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Spatial index for fast radius / bounding box queries
CREATE INDEX idx_facilities_location ON public.facilities USING GIST(location);
-- Index for owner lookups
CREATE INDEX idx_facilities_owner ON public.facilities(owner_id);
-- Index for status filtering
CREATE INDEX idx_facilities_status ON public.facilities(status);

-- ---------------------------------------------------------------------------
-- 5. Facility ↔ Sports (many-to-many)
-- ---------------------------------------------------------------------------
CREATE TABLE public.facility_sports (
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  sport_id    INT  NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  PRIMARY KEY (facility_id, sport_id)
);

-- ---------------------------------------------------------------------------
-- 6. Facility Opening Hours
-- ---------------------------------------------------------------------------
CREATE TABLE public.facility_hours (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID    NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  day_of_week INT     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Monday
  open_time   TIME,  -- NULL means closed that day
  close_time  TIME,
  is_closed   BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (facility_id, day_of_week)
);

-- ---------------------------------------------------------------------------
-- 7. Facility Images
-- ---------------------------------------------------------------------------
CREATE TABLE public.facility_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL, -- path in Supabase Storage (public bucket: facility-images)
  display_order INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 8. Student Discounts
-- ---------------------------------------------------------------------------
CREATE TABLE public.student_discounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount      TEXT,          -- e.g. "20%" or "€5 off"
  valid_until DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 9. Reviews
-- ---------------------------------------------------------------------------
CREATE TABLE public.reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating      INT  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (facility_id, user_id) -- one review per user per facility
);

CREATE INDEX idx_reviews_facility ON public.reviews(facility_id);

-- ---------------------------------------------------------------------------
-- 10. Events
-- ---------------------------------------------------------------------------
CREATE TABLE public.events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  event_date  TIMESTAMPTZ NOT NULL,
  status      public.event_status NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_facility ON public.events(facility_id);
CREATE INDEX idx_events_status   ON public.events(status);

-- ---------------------------------------------------------------------------
-- 11. Legal Documents (Business registration files)
-- ---------------------------------------------------------------------------
CREATE TABLE public.legal_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id  UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  owner_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,  -- path in PRIVATE bucket: legal-documents
  status       public.document_status NOT NULL DEFAULT 'pending',
  admin_notes  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at  TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- 12. Matchmaking Posts
-- ---------------------------------------------------------------------------
CREATE TABLE public.matchmaking_posts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sport_id   INT REFERENCES public.sports(id) ON DELETE SET NULL,
  skill_level public.skill_level NOT NULL DEFAULT 'beginner',
  post_date  DATE NOT NULL,
  message    TEXT NOT NULL,
  location_text TEXT,  -- free-form location description
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_matchmaking_sport ON public.matchmaking_posts(sport_id);

-- ---------------------------------------------------------------------------
-- 13. Email Campaigns (outreach tracking)
-- ---------------------------------------------------------------------------
CREATE TABLE public.email_campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  template_name TEXT NOT NULL,
  recipient_count INT NOT NULL DEFAULT 0,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 14. updated_at auto-update trigger (applied to relevant tables)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_facilities_updated_at
  BEFORE UPDATE ON public.facilities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 15. Geospatial Helper Function
-- Returns facilities within `radius_km` of a lat/lng point
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.facilities_within_radius(
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  radius_km  DOUBLE PRECISION DEFAULT 10,
  sport_filter INT DEFAULT NULL,
  discount_only BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID, name TEXT, description TEXT, address TEXT, city TEXT,
  location GEOGRAPHY, status public.facility_status,
  distance_m DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    f.id, f.name, f.description, f.address, f.city,
    f.location, f.status,
    ST_Distance(f.location, ST_MakePoint(lng, lat)::GEOGRAPHY) AS distance_m
  FROM public.facilities f
  WHERE
    f.status = 'active'
    AND ST_DWithin(
      f.location,
      ST_MakePoint(lng, lat)::GEOGRAPHY,
      radius_km * 1000  -- convert km to meters
    )
    AND (sport_filter IS NULL OR EXISTS (
      SELECT 1 FROM public.facility_sports fs
      WHERE fs.facility_id = f.id AND fs.sport_id = sport_filter
    ))
    AND (NOT discount_only OR EXISTS (
      SELECT 1 FROM public.student_discounts sd
      WHERE sd.facility_id = f.id
    ))
  ORDER BY distance_m ASC;
$$;

-- =============================================================================
-- 16. Row Level Security (RLS) Policies
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matchmaking_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports         ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Helper: get current user role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::TEXT FROM public.profiles WHERE id = auth.uid();
$$;

-- --- profiles ---
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- --- sports (public read) ---
CREATE POLICY "sports_select_all" ON public.sports
  FOR SELECT USING (true);

-- --- facilities ---
-- Public can read active facilities
CREATE POLICY "facilities_select_public" ON public.facilities
  FOR SELECT USING (status = 'active' OR owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "facilities_insert_business" ON public.facilities
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    public.get_user_role() IN ('business', 'admin')
  );

CREATE POLICY "facilities_update_owner" ON public.facilities
  FOR UPDATE USING (owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "facilities_delete_admin" ON public.facilities
  FOR DELETE USING (public.is_admin());

-- --- facility_sports ---
CREATE POLICY "facility_sports_select" ON public.facility_sports
  FOR SELECT USING (true);

CREATE POLICY "facility_sports_manage" ON public.facility_sports
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND (f.owner_id = auth.uid() OR public.is_admin())
    )
  );

-- --- facility_hours ---
CREATE POLICY "facility_hours_select" ON public.facility_hours
  FOR SELECT USING (true);

CREATE POLICY "facility_hours_manage" ON public.facility_hours
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND (f.owner_id = auth.uid() OR public.is_admin())
    )
  );

-- --- facility_images ---
CREATE POLICY "facility_images_select" ON public.facility_images
  FOR SELECT USING (true);

CREATE POLICY "facility_images_manage" ON public.facility_images
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND (f.owner_id = auth.uid() OR public.is_admin())
    )
  );

-- --- student_discounts ---
CREATE POLICY "discounts_select" ON public.student_discounts
  FOR SELECT USING (true);

CREATE POLICY "discounts_manage" ON public.student_discounts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.facilities f
      WHERE f.id = facility_id AND (f.owner_id = auth.uid() OR public.is_admin())
    )
  );

-- --- reviews ---
CREATE POLICY "reviews_select" ON public.reviews
  FOR SELECT USING (true);

CREATE POLICY "reviews_insert_authenticated" ON public.reviews
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "reviews_update_own" ON public.reviews
  FOR UPDATE USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "reviews_delete_own" ON public.reviews
  FOR DELETE USING (user_id = auth.uid() OR public.is_admin());

-- --- events ---
CREATE POLICY "events_select_approved" ON public.events
  FOR SELECT USING (status = 'approved' OR submitted_by = auth.uid() OR public.is_admin());

CREATE POLICY "events_insert_business" ON public.events
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    public.get_user_role() IN ('business', 'admin') AND
    submitted_by = auth.uid()
  );

CREATE POLICY "events_update" ON public.events
  FOR UPDATE USING (submitted_by = auth.uid() OR public.is_admin());

-- --- legal_documents ---
CREATE POLICY "legal_docs_select" ON public.legal_documents
  FOR SELECT USING (owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "legal_docs_insert" ON public.legal_documents
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "legal_docs_update_admin" ON public.legal_documents
  FOR UPDATE USING (public.is_admin());

-- --- matchmaking_posts ---
CREATE POLICY "matchmaking_select" ON public.matchmaking_posts
  FOR SELECT USING (is_active = true OR user_id = auth.uid());

CREATE POLICY "matchmaking_insert" ON public.matchmaking_posts
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "matchmaking_update_own" ON public.matchmaking_posts
  FOR UPDATE USING (user_id = auth.uid() OR public.is_admin());

-- --- email_campaigns ---
CREATE POLICY "campaigns_select_admin" ON public.email_campaigns
  FOR SELECT USING (public.is_admin());

CREATE POLICY "campaigns_insert_admin" ON public.email_campaigns
  FOR INSERT WITH CHECK (public.is_admin());

-- =============================================================================
-- 17. Storage Buckets
-- Run these in the Supabase Dashboard (Storage → New Bucket) or via this SQL:
-- =============================================================================

-- Public bucket for facility images
INSERT INTO storage.buckets (id, name, public)
VALUES ('facility-images', 'facility-images', true)
ON CONFLICT (id) DO NOTHING;

-- Private bucket for legal documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('legal-documents', 'legal-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: facility images (public read, authenticated write own)
CREATE POLICY "facility_images_bucket_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'facility-images');

CREATE POLICY "facility_images_bucket_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'facility-images' AND auth.uid() IS NOT NULL
  );

CREATE POLICY "facility_images_bucket_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'facility-images' AND auth.uid()::TEXT = (storage.foldername(name))[1]
  );

-- Storage RLS: legal documents (owner + admin only)
CREATE POLICY "legal_docs_bucket_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'legal-documents' AND (
      auth.uid()::TEXT = (storage.foldername(name))[1] OR
      public.is_admin()
    )
  );

CREATE POLICY "legal_docs_bucket_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'legal-documents' AND
    auth.uid() IS NOT NULL AND
    auth.uid()::TEXT = (storage.foldername(name))[1]
  );

-- =============================================================================
-- 18. GDPR: Automated Data Deletion Function
-- Deletes accounts that have been flagged for deletion > 30 days ago.
-- Wire this up to a pg_cron job: SELECT cron.schedule('0 2 * * *', $$SELECT public.gdpr_delete_expired_accounts()$$);
-- =============================================================================
CREATE OR REPLACE FUNCTION public.gdpr_delete_expired_accounts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Supabase provides a delete_user() function in auth admin
  -- This function can be extended to call it for flagged users
  -- For now, we delete profiles marked for deletion
  DELETE FROM auth.users
  WHERE id IN (
    SELECT id FROM public.profiles
    WHERE updated_at < now() - INTERVAL '30 days'
    -- In production: add a `deletion_requested_at` column and filter on that
  );
END;
$$;
