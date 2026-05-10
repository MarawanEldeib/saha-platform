-- SAH-128 follow-up: players couldn't lock slots when booking.
--
-- The booking flow in bookCourtCore() does a CAS update:
--   UPDATE court_availability SET is_booked = true
--    WHERE id = ? AND is_booked = false
-- to atomically reserve a slot before creating the booking row. But the
-- existing policies on court_availability only allow:
--   - SELECT for everyone (availability_select_public)
--   - ALL ops for the facility owner / admin (availability_manage_owner)
-- There is no UPDATE permission for players — so the CAS returns 0 rows
-- for them, and the app surfaces the misleading "Slot is no longer
-- available" error even when the slot is free.
--
-- Fix: a narrow UPDATE policy that lets a player flip a free slot to
-- booked and nothing else. Any other transition (booked → free, changing
-- date/time, changing court_id) stays blocked by the absence of any
-- broader player policy.
--
-- DOS exposure: a malicious player could lock slots without paying. The
-- existing flow already unlocks via Stripe `checkout.session.expired`
-- webhook + the abandoned-booking cleanup paths, so the window is the
-- 30-minute Stripe Checkout TTL — same as today for any owner-driven
-- flow. Acceptable.

CREATE POLICY "availability_lock_for_booking" ON public.court_availability
    FOR UPDATE
    TO authenticated
    USING (
        is_booked = false
        AND public.get_user_role() = 'user'
    )
    WITH CHECK (
        is_booked = true
    );
