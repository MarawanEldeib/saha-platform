-- =============================================================================
-- SAH-90: UAE VAT-compliant tax invoice fields.
-- - facilities.trn: optional Tax Registration Number; when present, invoices
--   are issued with a 5% VAT line.
-- - facilities.invoice_seq: monotonic per-facility counter for invoice
--   numbering (INV-{year}-{seq}).
-- - bookings.invoice_number / invoiced_at: assigned on first invoice view
--   so the same booking always shows the same number.
-- =============================================================================

ALTER TABLE public.facilities
    ADD COLUMN IF NOT EXISTS trn TEXT,
    ADD COLUMN IF NOT EXISTS invoice_seq BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS invoice_number TEXT,
    ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Atomic invoice-number assignment.
-- Locks the facility row, bumps invoice_seq, and stamps the booking. Idempotent:
-- if a booking already has a number, returns it without incrementing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_invoice_number(p_booking_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing TEXT;
    v_facility_id UUID;
    v_seq BIGINT;
    v_year INT;
    v_number TEXT;
BEGIN
    SELECT b.invoice_number, c.facility_id
      INTO v_existing, v_facility_id
      FROM public.bookings b
      JOIN public.courts c ON c.id = b.court_id
     WHERE b.id = p_booking_id;

    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    IF v_facility_id IS NULL THEN
        RAISE EXCEPTION 'booking not found';
    END IF;

    -- Lock the facility row and bump the counter atomically.
    UPDATE public.facilities
       SET invoice_seq = invoice_seq + 1
     WHERE id = v_facility_id
    RETURNING invoice_seq INTO v_seq;

    v_year := EXTRACT(YEAR FROM now());
    v_number := 'INV-' || v_year::TEXT || '-' || LPAD(v_seq::TEXT, 6, '0');

    UPDATE public.bookings
       SET invoice_number = v_number,
           invoiced_at    = now()
     WHERE id = p_booking_id;

    RETURN v_number;
END;
$$;
