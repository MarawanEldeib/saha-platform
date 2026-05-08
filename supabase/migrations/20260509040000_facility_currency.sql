-- =============================================================================
-- SAH-103: per-facility currency. Adding the column now (default 'AED' to
-- match every existing UAE row) means no backfill pain when we expand to
-- KSA (SAR), Egypt (EGP), Oman (OMR). Booking + Stripe code reads from this
-- instead of hardcoding 'AED'.
-- =============================================================================

ALTER TABLE public.facilities
    ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'AED'
    CHECK (currency IN ('AED', 'SAR', 'EGP', 'OMR', 'USD'));
