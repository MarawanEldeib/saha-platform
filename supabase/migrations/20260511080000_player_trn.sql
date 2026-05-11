-- SAH-90: optional player TRN on profiles, mirrors facilities.trn.
-- Corporate users who expense bookings against a company TRN need
-- their TRN printed on the invoice. 15-digit FTA format, nullable
-- by default. App-side validation lives in profileUpdateSchema.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS trn TEXT;

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_trn_format;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_trn_format
    CHECK (trn IS NULL OR trn ~ '^\d{15}$');
