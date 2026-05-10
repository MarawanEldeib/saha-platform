-- SAH-127: strict role separation. Block business owners and admins from
-- inserting bookings or reviews. To play, they create a separate player
-- account. Matches the one-role-per-account model the app already
-- assumes (single `user_role` enum value per profile, no concept of
-- multi-role users).
--
-- Defence in depth alongside the UI conditional in /facilities/[id]
-- and the early role check in bookCourtCore. If a malicious caller
-- bypasses the UI/API, the database refuses the insert.

-- ---------------------------------------------------------------------------
-- bookings: only role='user' may insert
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "bookings_insert_authenticated" ON public.bookings;

CREATE POLICY "bookings_insert_player_only" ON public.bookings
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND player_id = auth.uid()
        AND public.get_user_role() = 'user'
    );

-- ---------------------------------------------------------------------------
-- reviews: only role='user' may insert
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "reviews_insert_authenticated" ON public.reviews;

CREATE POLICY "reviews_insert_player_only" ON public.reviews
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND user_id = auth.uid()
        AND public.get_user_role() = 'user'
    );
