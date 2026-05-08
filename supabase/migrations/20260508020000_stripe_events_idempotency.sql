-- =============================================================================
-- SAH-72: stripe_events table for webhook idempotency.
-- Stripe retries delivery on any non-2xx response (and on intermittent
-- timeouts). Without dedup, a retried checkout.session.completed would
-- fire WhatsApp + email confirmations twice.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.stripe_events (
    id           TEXT        PRIMARY KEY,
    type         TEXT        NOT NULL,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_received_at
    ON public.stripe_events(received_at DESC);

-- Only the service role writes to this table from the webhook handler.
-- Lock everything down via RLS.
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
