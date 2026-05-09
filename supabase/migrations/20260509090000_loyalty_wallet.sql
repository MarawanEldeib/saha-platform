-- SAH-93: loyalty wallet — every 10 completed bookings credits the player
-- with the AED equivalent of one average hourly slot (capped at AED 50).
-- Owner stays whole; the credit is subsidised from the platform fee at
-- redemption time (see createBookingAndCheckoutAction).

CREATE TABLE IF NOT EXISTS public.wallet_balances (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    credit_aed NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (credit_aed >= 0),
    bookings_at_last_award INT NOT NULL DEFAULT 0 CHECK (bookings_at_last_award >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount_aed NUMERIC(10,2) NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('booking_milestone', 'spend', 'refund', 'admin')),
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_transactions_user_id_idx
    ON public.wallet_transactions (user_id, created_at DESC);

ALTER TABLE public.wallet_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Users can read their own balance + ledger; writes happen only via the
-- service role (server actions, cron) so we keep the SECURITY DEFINER RPCs
-- as the only mutation path.
DROP POLICY IF EXISTS wallet_balances_self_read ON public.wallet_balances;
CREATE POLICY wallet_balances_self_read
    ON public.wallet_balances
    FOR SELECT
    USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS wallet_transactions_self_read ON public.wallet_transactions;
CREATE POLICY wallet_transactions_self_read
    ON public.wallet_transactions
    FOR SELECT
    USING (user_id = (select auth.uid()));

-- Awards a milestone credit if the user has completed 10+ bookings since
-- their last award. Idempotent — call from markCheckedInAction every time
-- a booking flips to completed; it's a no-op until the threshold is met.
-- Returns the credit amount awarded (0 if nothing was awarded).
CREATE OR REPLACE FUNCTION public.award_loyalty_credit_if_due(p_user_id UUID)
RETURNS NUMERIC(10,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_completed_count INT;
    v_last_award_count INT;
    v_threshold CONSTANT INT := 10;
    v_max_credit CONSTANT NUMERIC(10,2) := 50;
    v_avg_price NUMERIC(10,2);
    v_credit NUMERIC(10,2);
BEGIN
    -- Count completed bookings ever for this user.
    SELECT COUNT(*) INTO v_completed_count
        FROM public.bookings
        WHERE player_id = p_user_id
          AND status = 'completed';

    -- Ensure the wallet row exists, lock it for the read-modify-write.
    INSERT INTO public.wallet_balances (user_id) VALUES (p_user_id)
        ON CONFLICT (user_id) DO NOTHING;

    SELECT bookings_at_last_award INTO v_last_award_count
        FROM public.wallet_balances
        WHERE user_id = p_user_id
        FOR UPDATE;

    IF v_completed_count - v_last_award_count < v_threshold THEN
        RETURN 0;
    END IF;

    -- Average price of the most recent 10 completed bookings, capped.
    SELECT COALESCE(AVG(total_price), 0) INTO v_avg_price
        FROM (
            SELECT total_price
              FROM public.bookings
             WHERE player_id = p_user_id AND status = 'completed'
             ORDER BY date DESC, start_time DESC
             LIMIT v_threshold
        ) recent;

    v_credit := LEAST(v_avg_price, v_max_credit);
    IF v_credit <= 0 THEN
        RETURN 0;
    END IF;

    UPDATE public.wallet_balances
        SET credit_aed = credit_aed + v_credit,
            bookings_at_last_award = v_completed_count,
            updated_at = now()
        WHERE user_id = p_user_id;

    INSERT INTO public.wallet_transactions (user_id, amount_aed, reason)
        VALUES (p_user_id, v_credit, 'booking_milestone');

    RETURN v_credit;
END;
$$;

-- Atomic spend with cap enforcement. Returns the amount actually deducted
-- (0 if balance was insufficient or the booking would have gone negative).
CREATE OR REPLACE FUNCTION public.spend_wallet_credit(
    p_user_id UUID,
    p_amount NUMERIC(10,2),
    p_booking_id UUID
)
RETURNS NUMERIC(10,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance NUMERIC(10,2);
    v_spend NUMERIC(10,2);
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN 0;
    END IF;

    SELECT credit_aed INTO v_balance
        FROM public.wallet_balances
        WHERE user_id = p_user_id
        FOR UPDATE;

    IF v_balance IS NULL THEN
        RETURN 0;
    END IF;

    v_spend := LEAST(p_amount, v_balance);
    IF v_spend <= 0 THEN
        RETURN 0;
    END IF;

    UPDATE public.wallet_balances
        SET credit_aed = credit_aed - v_spend,
            updated_at = now()
        WHERE user_id = p_user_id;

    INSERT INTO public.wallet_transactions (user_id, amount_aed, reason, booking_id)
        VALUES (p_user_id, -v_spend, 'spend', p_booking_id);

    RETURN v_spend;
END;
$$;
