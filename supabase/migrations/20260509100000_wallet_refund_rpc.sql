-- SAH-93 follow-up: when Stripe Checkout creation fails after we've already
-- debited the wallet, the spend would otherwise stay burned with no booking
-- to show for it. This RPC restores the credit + writes a 'refund' ledger
-- row so the audit trail stays clean.
CREATE OR REPLACE FUNCTION public.refund_wallet_credit(
    p_user_id UUID,
    p_amount NUMERIC(10,2),
    p_booking_id UUID
)
RETURNS NUMERIC(10,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN 0;
    END IF;

    -- Ensure the wallet row exists (it should, since we just spent from it,
    -- but be defensive). No row lock needed — refund is additive.
    INSERT INTO public.wallet_balances (user_id, credit_aed) VALUES (p_user_id, 0)
        ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.wallet_balances
        SET credit_aed = credit_aed + p_amount,
            updated_at = now()
        WHERE user_id = p_user_id;

    INSERT INTO public.wallet_transactions (user_id, amount_aed, reason, booking_id)
        VALUES (p_user_id, p_amount, 'refund', p_booking_id);

    RETURN p_amount;
END;
$$;
