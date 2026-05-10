-- Fix: profiles RLS (`profiles_select_own`) only allows reading your own
-- profile, which breaks joins on /community, /messages inbox, and the
-- conversation thread — players see "Unknown player" / "Anonymous" instead
-- of the other person's display name.
--
-- Solution: a SECURITY-DEFINER-equivalent VIEW exposing only the
-- non-sensitive fields. Sensitive columns (phone, phone_verification_sid,
-- deletion_requested_at) stay protected on the underlying profiles table.
--
-- security_invoker=false runs the view with the view OWNER's privileges,
-- bypassing the caller's RLS. The narrow column list is the actual security
-- boundary — even if a malicious caller queries the view, they only see
-- what we've decided is public-by-design.

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT
    id,
    display_name,
    avatar_url,
    role,
    no_show_count,
    created_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;
