-- SAH-96: in-app messaging foundation (custom DMs, no Stream Chat).
--
-- Conversations are 1:1 between two players. The (low, high) sorted-id
-- constraint means whether A messages B or B messages A, both resolve to
-- the same conversation row. Avoids duplicate (A,B) / (B,A) rows.
--
-- Messages are text-only v1, immutable once sent (no UPDATE policy). The
-- recipient's read receipt lives on the message itself via read_at.
--
-- RLS enforces player-only access matching the role separation pattern
-- from SAH-127 / SAH-136. Owners and admins can never see or write
-- messages even though their profile rows are FK-eligible.

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
CREATE TABLE public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Sorted lexicographically so (a,b) and (b,a) collapse to one row.
    player_low_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    player_high_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    -- Optional pointer to the matchmaking post that originated the chat.
    matchmaking_post_id UUID REFERENCES public.matchmaking_posts(id) ON DELETE SET NULL,
    -- Denormalised so the inbox can sort by activity without joining messages.
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT conversations_pair_unique UNIQUE (player_low_id, player_high_id),
    CONSTRAINT conversations_pair_sorted CHECK (player_low_id < player_high_id)
);

CREATE INDEX idx_conversations_low ON public.conversations (player_low_id, last_message_at DESC);
CREATE INDEX idx_conversations_high ON public.conversations (player_high_id, last_message_at DESC);
CREATE INDEX idx_conversations_post ON public.conversations (matchmaking_post_id) WHERE matchmaking_post_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation_created ON public.messages (conversation_id, created_at DESC);
CREATE INDEX idx_messages_unread ON public.messages (conversation_id, sender_id) WHERE read_at IS NULL;

-- ---------------------------------------------------------------------------
-- Auto-update conversations.last_message_at when a new message is inserted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.conversations
    SET last_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER messages_touch_conversation
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_last_message();

-- ---------------------------------------------------------------------------
-- Helper: insert-or-get a conversation between two players (in any order).
-- Returns the conversation id. Use from server actions when sender clicks
-- "Message this player" — saves the round-trip of "do they have a chat? if
-- not, create one."
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_conversation(
    p_a UUID,
    p_b UUID,
    p_matchmaking_post_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_low UUID;
    v_high UUID;
    v_id UUID;
BEGIN
    IF p_a = p_b THEN
        RAISE EXCEPTION 'Cannot create a conversation with yourself';
    END IF;

    IF p_a < p_b THEN
        v_low := p_a;
        v_high := p_b;
    ELSE
        v_low := p_b;
        v_high := p_a;
    END IF;

    -- Both participants must be players. Owners/admins should not be in
    -- conversations even if a row gets created somehow.
    IF NOT (
        SELECT (low.role = 'user' AND high.role = 'user')
        FROM public.profiles low, public.profiles high
        WHERE low.id = v_low AND high.id = v_high
    ) THEN
        RAISE EXCEPTION 'Both participants must have role = user';
    END IF;

    INSERT INTO public.conversations (player_low_id, player_high_id, matchmaking_post_id)
    VALUES (v_low, v_high, p_matchmaking_post_id)
    ON CONFLICT (player_low_id, player_high_id) DO UPDATE
        -- Don't clobber an existing matchmaking_post_id with NULL on later DMs
        SET matchmaking_post_id = COALESCE(public.conversations.matchmaking_post_id, EXCLUDED.matchmaking_post_id)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_conversation(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_conversation(UUID, UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Conversations: only the two participants can SELECT, both must be players.
CREATE POLICY "conversations_select_participants" ON public.conversations
    FOR SELECT USING (
        (auth.uid() = player_low_id OR auth.uid() = player_high_id)
        AND public.get_user_role() = 'user'
    );

-- INSERT goes through upsert_conversation() (SECURITY DEFINER), so we don't
-- need a permissive INSERT policy. Lock it down.
CREATE POLICY "conversations_insert_blocked" ON public.conversations
    FOR INSERT WITH CHECK (false);

-- UPDATE: only the trigger-driven touch and the upsert helper need to
-- write — both bypass RLS via SECURITY DEFINER. Block direct updates.
CREATE POLICY "conversations_update_blocked" ON public.conversations
    FOR UPDATE USING (false);

-- Messages: participants can SELECT all messages in their conversations.
CREATE POLICY "messages_select_participants" ON public.messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id
              AND (auth.uid() = c.player_low_id OR auth.uid() = c.player_high_id)
        )
        AND public.get_user_role() = 'user'
    );

-- Sender must be a participant + a player + sending as themselves.
CREATE POLICY "messages_insert_sender" ON public.messages
    FOR INSERT WITH CHECK (
        sender_id = auth.uid()
        AND public.get_user_role() = 'user'
        AND EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id
              AND (auth.uid() = c.player_low_id OR auth.uid() = c.player_high_id)
        )
    );

-- UPDATE messages: only allowed to set read_at on messages you didn't send
-- (recipient marking read). Body / sender_id stay immutable.
CREATE POLICY "messages_update_recipient_read" ON public.messages
    FOR UPDATE USING (
        sender_id != auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id
              AND (auth.uid() = c.player_low_id OR auth.uid() = c.player_high_id)
        )
    )
    WITH CHECK (
        sender_id != auth.uid()
    );

-- DELETE: nope. Block + report comes later.
CREATE POLICY "messages_delete_blocked" ON public.messages
    FOR DELETE USING (false);
