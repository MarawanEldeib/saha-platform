-- =============================================================================
-- SAH-83: Tighten reviews RLS — only allow review insert when the user has a
-- completed booking at the facility. Stops competitor sabotage / drive-by
-- fake-review attacks.
-- SAH-84: Harden handle_new_user — never trust raw_user_meta_data for admin.
-- SAH-85: Remove the legacy 'Germany' default on facilities.country and
-- backfill existing rows that still hold it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SAH-83: reviews_insert — require completed booking at the facility.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "reviews_insert_authenticated" ON public.reviews;
DROP POLICY IF EXISTS "reviews_insert_after_booking" ON public.reviews;

CREATE POLICY "reviews_insert_after_booking" ON public.reviews
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND user_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.bookings b
            JOIN public.courts c ON c.id = b.court_id
            WHERE c.facility_id = reviews.facility_id
              AND b.player_id = auth.uid()
              AND b.status = 'completed'
        )
    );

-- ---------------------------------------------------------------------------
-- SAH-84: handle_new_user — never elevate to admin via user-supplied metadata.
-- Admins are promoted only via SQL by an existing admin.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, role, display_name)
    VALUES (
        NEW.id,
        CASE
            WHEN NEW.raw_user_meta_data->>'role' = 'business' THEN 'business'::public.user_role
            ELSE 'user'::public.user_role
        END,
        COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
    );
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- SAH-85: drop the 'Germany' default and backfill any existing legacy rows.
-- Real country handling will be added when we expand beyond UAE (SAH-103).
-- ---------------------------------------------------------------------------
UPDATE public.facilities SET country = 'AE' WHERE country = 'Germany';

ALTER TABLE public.facilities
    ALTER COLUMN country SET DEFAULT 'AE';
