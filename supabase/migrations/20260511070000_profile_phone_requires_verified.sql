-- SAH-79: defense in depth. The application now refuses to persist a
-- new phone number on profiles until WhatsApp Verify confirms it, but
-- a direct UPDATE via RLS (which permits self-updates) would still let
-- a malicious caller inject anyone's number.
--
-- This trigger enforces the contract at the DB layer: every UPDATE that
-- changes profiles.phone to a non-null value must set phone_verified =
-- true in the same statement. The server actions do this atomically via
-- checkPhoneVerificationAction.
--
-- Clearing the phone (phone -> null) is always allowed.
-- Same phone with unchanged value skips the trigger.

CREATE OR REPLACE FUNCTION public.profiles_phone_requires_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Allow clearing.
    IF NEW.phone IS NULL THEN
        RETURN NEW;
    END IF;

    -- Allow setting/changing to a non-null phone only if the same row
    -- transition flips phone_verified to true. We don't trust "stays true"
    -- — the action MUST re-prove verification for the new number.
    IF (TG_OP = 'INSERT' AND NEW.phone_verified = true)
       OR (TG_OP = 'UPDATE'
           AND NEW.phone IS DISTINCT FROM OLD.phone
           AND NEW.phone_verified = true) THEN
        RETURN NEW;
    END IF;

    -- Same phone, no change — pass through.
    IF TG_OP = 'UPDATE' AND NEW.phone IS NOT DISTINCT FROM OLD.phone THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Phone change requires WhatsApp verification (SAH-79). Use checkPhoneVerificationAction.';
END;
$$;

DROP TRIGGER IF EXISTS profiles_phone_requires_verified ON public.profiles;
CREATE TRIGGER profiles_phone_requires_verified
    BEFORE INSERT OR UPDATE OF phone, phone_verified ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.profiles_phone_requires_verified();
