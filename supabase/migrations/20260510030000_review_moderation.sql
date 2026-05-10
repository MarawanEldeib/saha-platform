-- SAH-130: admin review moderation
--
-- Soft-delete (hide) for reviews. Hidden rows stay in the DB so we can
-- audit / unhide later, but are filtered out of the public SELECT for
-- non-admins. Hard delete still works (handled in the action layer).

ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS hidden_reason TEXT;

-- Replace SELECT policy: non-admins must not see hidden reviews. The row
-- owner doesn't get to see their own hidden review either — that matches
-- moderation intent (they shouldn't be able to tell whether it was hidden
-- or just deleted).
DROP POLICY IF EXISTS "reviews_select" ON public.reviews;
CREATE POLICY "reviews_select" ON public.reviews
  FOR SELECT USING (hidden_at IS NULL OR public.is_admin());
