-- SAH-96 PR C: web push subscriptions storage.
--
-- Each row is one (user, browser) tuple. A user can have multiple
-- subscriptions if they enable push on multiple devices (phone + laptop).
-- Endpoint is unique-per-row because the same browser keeps generating
-- new endpoints if you re-subscribe; we treat the latest as authoritative
-- via UPSERT on (user_id, endpoint).

CREATE TABLE public.web_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT web_push_subscriptions_user_endpoint_unique UNIQUE (user_id, endpoint)
);

CREATE INDEX idx_web_push_user ON public.web_push_subscriptions (user_id);

CREATE TRIGGER set_web_push_subscriptions_updated_at
BEFORE UPDATE ON public.web_push_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can manage their own subscriptions only.
CREATE POLICY "wps_select_own" ON public.web_push_subscriptions
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "wps_insert_own" ON public.web_push_subscriptions
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "wps_update_own" ON public.web_push_subscriptions
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "wps_delete_own" ON public.web_push_subscriptions
    FOR DELETE USING (user_id = auth.uid());

-- Server-side push sending uses the admin client to read recipient
-- subscriptions; RLS bypass via service role is intentional.
