-- Restrict launch footprint to selected countries and focused racquet sports.

BEGIN;

-- 1) Keep only focused sports in the catalog.
INSERT INTO public.sports (name, icon)
VALUES
  ('Padel', 'circle-dot'),
  ('Badminton', 'circle'),
  ('Squash', 'square'),
  ('Tennis', 'circle')
ON CONFLICT (name) DO NOTHING;

DELETE FROM public.facility_sports
WHERE sport_id NOT IN (
  SELECT id
  FROM public.sports
  WHERE name IN ('Padel', 'Badminton', 'Squash', 'Tennis')
);

DELETE FROM public.sports
WHERE name NOT IN ('Padel', 'Badminton', 'Squash', 'Tennis');

-- 2) Restrict countries for facilities to launch markets.
ALTER TABLE public.facilities
  ALTER COLUMN country SET DEFAULT 'United Arab Emirates';

ALTER TABLE public.facilities
  DROP CONSTRAINT IF EXISTS facilities_country_launch_scope_check;

ALTER TABLE public.facilities
  ADD CONSTRAINT facilities_country_launch_scope_check
  CHECK (country IN ('Egypt', 'Malaysia', 'Qatar', 'United Arab Emirates'))
  NOT VALID;

COMMIT;
