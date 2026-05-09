-- SAH-92: per-guest split payment tracking. Existing booking_guests row
-- gets the financial fields it needs to back a Stripe Payment Link flow.
-- Each guest pays the platform; the booker accumulates an equivalent
-- wallet credit on success (handled in the webhook).

ALTER TABLE public.booking_guests
    ADD COLUMN IF NOT EXISTS share_amount NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'AED',
    ADD COLUMN IF NOT EXISTS payment_status TEXT
        NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'paid', 'cancelled', 'failed')),
    ADD COLUMN IF NOT EXISTS stripe_payment_link_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_payment_link_url TEXT,
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS booking_guests_payment_link_idx
    ON public.booking_guests (stripe_payment_link_id)
    WHERE stripe_payment_link_id IS NOT NULL;
