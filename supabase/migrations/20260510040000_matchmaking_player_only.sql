-- SAH-136: lock matchmaking_posts INSERT to the player role.
--
-- Defense in depth: SAH-127 already established strict role separation for
-- bookings + reviews. matchmaking_posts was missed in that pass — any
-- authenticated user (including business owners and admins) could post,
-- which breaks the "one role per account" rule.
--
-- The browser-side guard is added separately in src/app/[locale]/community/
-- page.tsx; this migration is the RLS backstop.

DROP POLICY IF EXISTS "matchmaking_insert" ON public.matchmaking_posts;
DROP POLICY IF EXISTS "matchmaking_insert_player_only" ON public.matchmaking_posts;

CREATE POLICY "matchmaking_insert_player_only" ON public.matchmaking_posts
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND user_id = auth.uid()
        AND public.get_user_role() = 'user'
    );

-- Soft-clean any existing rows that were posted by non-player accounts.
-- We set is_active = false rather than DELETE so the audit trail / forensic
-- record stays intact. Only rows whose poster's current role is not 'user'
-- get hidden — if someone changed roles after posting, that's their record.
UPDATE public.matchmaking_posts m
SET is_active = false
FROM public.profiles p
WHERE m.user_id = p.id
  AND p.role != 'user'
  AND m.is_active = true;
