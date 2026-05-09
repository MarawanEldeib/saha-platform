-- SAH-79: track WhatsApp phone verification state. When phone_verified is
-- false, downstream WhatsApp sends MUST be skipped — otherwise we leak
-- booking confirmations to whoever happens to own that number.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS phone_verification_sid TEXT;

-- Existing rows that already have a phone get marked verified=false; the
-- user has to re-verify on next profile edit. Acceptable trade-off: small
-- friction once vs. the privacy-leak risk of grandfathering them in.
