-- =============================================================================
-- SAH-152 Phase 1: Matches schema foundation.
--
-- Extends the existing `matchmaking_posts` table with the new "match" semantics
-- (title, scheduled_for, court_id, format, capacity, status, gate) and adds
-- the seven new tables that drive the Matches product:
--
--   - match_participants   - who's actually playing in the match
--   - match_invites        - host invited specific users
--   - match_join_requests  - non-host requested to join a gated match
--   - match_messages       - match-scoped group chat (separate from generic DMs)
--   - player_contacts      - one-sided friend list per player
--   - player_groups        - named groups of contacts ("Padel Buddies")
--   - player_group_members - membership join table
--
-- `matchmaking_posts` is NOT renamed in this migration. Phase 2 will rename it
-- to `matches` and drop the legacy `is_active` / `post_date` / `message`
-- columns once all callers have switched to the new column names. Keeping the
-- name stable for Phase 1 means the existing `/community` page and seven
-- source files that reference `matchmaking_posts` keep working unchanged.
--
-- The existing RLS on matchmaking_posts (insert-player-only, select-visible-
-- or-own, update-own-or-admin) is preserved as-is.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fill the skill_level enum gap. The code (validations.ts:144 and
--    `/community` form) accepts `competitive` but the DB enum is missing it,
--    so any insert from a player picking "Competitive" would have errored.
-- ---------------------------------------------------------------------------
ALTER TYPE public.skill_level ADD VALUE IF NOT EXISTS 'competitive';

-- ---------------------------------------------------------------------------
-- 2. Add Match columns to matchmaking_posts.
-- ---------------------------------------------------------------------------
ALTER TABLE public.matchmaking_posts
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS court_id UUID REFERENCES public.courts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS format TEXT,
    ADD COLUMN IF NOT EXISTS capacity INTEGER,
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS gate TEXT;

-- ---------------------------------------------------------------------------
-- 3. Backfill from legacy columns.
--    - title          = first 60 chars of message (legacy post body)
--    - scheduled_for  = post_date + 18:00 local (best-effort; players can edit)
--    - format         = 'casual' (closest single-bucket label for free-text posts)
--    - capacity       = 4 (typical 1v1/2v2 racket-sport default)
--    - status         = 'open' if is_active, else 'cancelled'
--    - gate           = 'open' (all existing posts were public broadcasts)
-- ---------------------------------------------------------------------------
UPDATE public.matchmaking_posts SET
    title         = COALESCE(title,         LEFT(message, 60)),
    scheduled_for = COALESCE(scheduled_for, (post_date + TIME '18:00')::timestamptz),
    format        = COALESCE(format,        'casual'),
    capacity      = COALESCE(capacity,      4),
    status        = COALESCE(status,        CASE WHEN is_active THEN 'open' ELSE 'cancelled' END),
    gate          = COALESCE(gate,          'open');

-- ---------------------------------------------------------------------------
-- 4. Enforce NOT NULL + sanity checks on the new columns.
-- ---------------------------------------------------------------------------
ALTER TABLE public.matchmaking_posts
    ALTER COLUMN title         SET NOT NULL,
    ALTER COLUMN scheduled_for SET NOT NULL,
    ALTER COLUMN format        SET NOT NULL,
    ALTER COLUMN capacity      SET NOT NULL,
    ALTER COLUMN status        SET NOT NULL,
    ALTER COLUMN gate          SET NOT NULL;

ALTER TABLE public.matchmaking_posts
    DROP CONSTRAINT IF EXISTS matches_status_check,
    DROP CONSTRAINT IF EXISTS matches_gate_check,
    DROP CONSTRAINT IF EXISTS matches_capacity_check,
    DROP CONSTRAINT IF EXISTS matches_title_length_check;

ALTER TABLE public.matchmaking_posts
    ADD CONSTRAINT matches_status_check         CHECK (status IN ('open', 'live', 'completed', 'cancelled')),
    ADD CONSTRAINT matches_gate_check           CHECK (gate   IN ('open', 'request', 'invite_only')),
    ADD CONSTRAINT matches_capacity_check       CHECK (capacity BETWEEN 1 AND 50),
    ADD CONSTRAINT matches_title_length_check   CHECK (length(title) BETWEEN 1 AND 100);

-- Cards filter by `status='open' ORDER BY scheduled_for`. Partial index keeps
-- the lookup tight (most posts age out into completed/cancelled).
CREATE INDEX IF NOT EXISTS matches_open_scheduled_for_idx
    ON public.matchmaking_posts (scheduled_for)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS matches_status_idx
    ON public.matchmaking_posts (status);

-- ---------------------------------------------------------------------------
-- 5. match_participants — who's actually playing the match.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.match_participants (
    match_id  UUID NOT NULL REFERENCES public.matchmaking_posts(id) ON DELETE CASCADE,
    user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role      TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('host', 'player')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS match_participants_user_idx
    ON public.match_participants (user_id);

ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated reads (the cards need to show participant avatars).
DROP POLICY IF EXISTS "mp_select_public" ON public.match_participants;
CREATE POLICY "mp_select_public" ON public.match_participants
    FOR SELECT TO authenticated USING (true);

-- A player adds themselves only — joinMatchAction enforces capacity + gate.
DROP POLICY IF EXISTS "mp_self_insert" ON public.match_participants;
CREATE POLICY "mp_self_insert" ON public.match_participants
    FOR INSERT TO authenticated WITH CHECK (
        user_id = auth.uid() AND role = 'player'
    );

-- Player leaves their own row, or host removes anyone from their match.
DROP POLICY IF EXISTS "mp_self_or_host_delete" ON public.match_participants;
CREATE POLICY "mp_self_or_host_delete" ON public.match_participants
    FOR DELETE TO authenticated USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.matchmaking_posts m
            WHERE m.id = match_participants.match_id
              AND m.user_id = auth.uid()
        )
    );

-- Backfill: every existing post's owner is the host of that match.
INSERT INTO public.match_participants (match_id, user_id, role, joined_at)
SELECT id, user_id, 'host', created_at
FROM public.matchmaking_posts
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. match_invites — host (or co-participants in future) invited specific users.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.match_invites (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id         UUID NOT NULL REFERENCES public.matchmaking_posts(id) ON DELETE CASCADE,
    invitee_user_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    inviter_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status           TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
    sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at     TIMESTAMPTZ,
    UNIQUE (match_id, invitee_user_id)
);

CREATE INDEX IF NOT EXISTS match_invites_invitee_idx
    ON public.match_invites (invitee_user_id, status);

ALTER TABLE public.match_invites ENABLE ROW LEVEL SECURITY;

-- Invitee + inviter both see the row; nobody else.
DROP POLICY IF EXISTS "mi_party_select" ON public.match_invites;
CREATE POLICY "mi_party_select" ON public.match_invites
    FOR SELECT TO authenticated USING (
        invitee_user_id = auth.uid() OR inviter_id = auth.uid()
    );

-- Only the match host can invite. Co-participant invites can be enabled in a
-- later phase by widening this policy.
DROP POLICY IF EXISTS "mi_host_insert" ON public.match_invites;
CREATE POLICY "mi_host_insert" ON public.match_invites
    FOR INSERT TO authenticated WITH CHECK (
        inviter_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.matchmaking_posts m
            WHERE m.id = match_id AND m.user_id = auth.uid()
        )
    );

-- Invitee accepts/declines their own invite.
DROP POLICY IF EXISTS "mi_invitee_respond" ON public.match_invites;
CREATE POLICY "mi_invitee_respond" ON public.match_invites
    FOR UPDATE TO authenticated USING (invitee_user_id = auth.uid());

-- Inviter can cancel a still-pending invite.
DROP POLICY IF EXISTS "mi_inviter_cancel" ON public.match_invites;
CREATE POLICY "mi_inviter_cancel" ON public.match_invites
    FOR UPDATE TO authenticated USING (inviter_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7. match_join_requests — for gate='request' matches, a non-invitee asks.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.match_join_requests (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id           UUID NOT NULL REFERENCES public.matchmaking_posts(id) ON DELETE CASCADE,
    requester_user_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status             TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at       TIMESTAMPTZ,
    UNIQUE (match_id, requester_user_id)
);

CREATE INDEX IF NOT EXISTS match_join_requests_match_status_idx
    ON public.match_join_requests (match_id, status);

ALTER TABLE public.match_join_requests ENABLE ROW LEVEL SECURITY;

-- Requester + host see the row.
DROP POLICY IF EXISTS "mjr_party_select" ON public.match_join_requests;
CREATE POLICY "mjr_party_select" ON public.match_join_requests
    FOR SELECT TO authenticated USING (
        requester_user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.matchmaking_posts m
            WHERE m.id = match_id AND m.user_id = auth.uid()
        )
    );

-- A player files a join request for themselves.
DROP POLICY IF EXISTS "mjr_self_insert" ON public.match_join_requests;
CREATE POLICY "mjr_self_insert" ON public.match_join_requests
    FOR INSERT TO authenticated WITH CHECK (
        requester_user_id = auth.uid()
    );

-- Host approves/declines.
DROP POLICY IF EXISTS "mjr_host_update" ON public.match_join_requests;
CREATE POLICY "mjr_host_update" ON public.match_join_requests
    FOR UPDATE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.matchmaking_posts m
            WHERE m.id = match_id AND m.user_id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------------
-- 8. match_messages — group chat scoped to the match. Distinct from the
--    generic 1:1 conversations table that powers /messages.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.match_messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id   UUID NOT NULL REFERENCES public.matchmaking_posts(id) ON DELETE CASCADE,
    sender_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS match_messages_match_created_idx
    ON public.match_messages (match_id, created_at);

ALTER TABLE public.match_messages ENABLE ROW LEVEL SECURITY;

-- Only participants of the match can read its chat.
DROP POLICY IF EXISTS "mm_participant_select" ON public.match_messages;
CREATE POLICY "mm_participant_select" ON public.match_messages
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.match_participants mp
            WHERE mp.match_id = match_messages.match_id
              AND mp.user_id  = auth.uid()
        )
    );

-- Only participants can post. RLS doubles up the action-layer check.
DROP POLICY IF EXISTS "mm_participant_insert" ON public.match_messages;
CREATE POLICY "mm_participant_insert" ON public.match_messages
    FOR INSERT TO authenticated WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.match_participants mp
            WHERE mp.match_id = match_messages.match_id
              AND mp.user_id  = auth.uid()
        )
    );

-- ---------------------------------------------------------------------------
-- 9. player_contacts — one-sided friend list. Mutual-consent is a future SAH.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_contacts (
    owner_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    contact_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_id, contact_user_id),
    CHECK (owner_id <> contact_user_id)
);

CREATE INDEX IF NOT EXISTS player_contacts_owner_idx
    ON public.player_contacts (owner_id);

ALTER TABLE public.player_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pc_owner_all" ON public.player_contacts;
CREATE POLICY "pc_owner_all" ON public.player_contacts
    FOR ALL TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 10. player_groups + player_group_members — named groups of contacts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_groups (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name       TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS player_groups_owner_idx
    ON public.player_groups (owner_id);

ALTER TABLE public.player_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pg_owner_all" ON public.player_groups;
CREATE POLICY "pg_owner_all" ON public.player_groups
    FOR ALL TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.player_group_members (
    group_id        UUID NOT NULL REFERENCES public.player_groups(id) ON DELETE CASCADE,
    member_user_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, member_user_id)
);

ALTER TABLE public.player_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pgm_owner_all" ON public.player_group_members;
CREATE POLICY "pgm_owner_all" ON public.player_group_members
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.player_groups pg
            WHERE pg.id = group_id AND pg.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.player_groups pg
            WHERE pg.id = group_id AND pg.owner_id = auth.uid()
        )
    );
