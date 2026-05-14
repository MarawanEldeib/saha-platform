-- =============================================================================
-- SAH-152 bounce-back: respondToJoinRequestAction (host accepts a join
-- request) was silently failing because the match_participants INSERT
-- policy required `user_id = auth.uid()`. The host (auth.uid = host_id)
-- cannot insert a row for the requester. The action would update the
-- request to status='accepted', then the participant insert silently
-- fails, and the requester sees a stale "You already have a pending
-- request" state on the UI.
--
-- Widen the INSERT policy so the match owner can also seat players in
-- their own match. role='player' still enforced — the role='host' slot
-- is established via the matchmaking_posts.user_id column, not via this
-- table's role field.
-- =============================================================================

DROP POLICY IF EXISTS "mp_self_insert" ON public.match_participants;
DROP POLICY IF EXISTS "mp_self_or_host_insert" ON public.match_participants;

CREATE POLICY "mp_self_or_host_insert" ON public.match_participants
    FOR INSERT TO authenticated
    WITH CHECK (
        role = 'player'
        AND (
            user_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM public.matchmaking_posts m
                WHERE m.id = match_participants.match_id
                  AND m.user_id = auth.uid()
            )
        )
    );
