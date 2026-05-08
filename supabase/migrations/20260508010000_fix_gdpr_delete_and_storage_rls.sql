-- =============================================================================
-- SAH-70: Gate gdpr_delete_expired_accounts on a real deletion request column
-- and SAH-71: scope facility-images bucket INSERT to the facility owner.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SAH-70: deletion_requested_at column + safe GDPR delete function
-- The previous version deleted every user whose updated_at was older than 30
-- days — i.e. anyone who hadn't logged in for a month. Now scoped to users
-- who actually requested deletion ≥ 30 days ago.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.gdpr_delete_expired_accounts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM auth.users
    WHERE id IN (
        SELECT id FROM public.profiles
        WHERE deletion_requested_at IS NOT NULL
          AND deletion_requested_at < now() - INTERVAL '30 days'
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- SAH-71: scope facility-images INSERT/UPDATE to the facility owner.
-- Storage paths are {facility_id}/{timestamp}-{random}-{name}, so we extract
-- the first folder segment and verify the calling user owns that facility.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "facility_images_bucket_insert" ON storage.objects;

CREATE POLICY "facility_images_bucket_insert" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'facility-images'
        AND auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.facilities f
            WHERE f.id::TEXT = (storage.foldername(name))[1]
              AND (f.owner_id = auth.uid() OR public.is_admin())
        )
    );

DROP POLICY IF EXISTS "facility_images_bucket_update" ON storage.objects;

CREATE POLICY "facility_images_bucket_update" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'facility-images'
        AND EXISTS (
            SELECT 1 FROM public.facilities f
            WHERE f.id::TEXT = (storage.foldername(name))[1]
              AND (f.owner_id = auth.uid() OR public.is_admin())
        )
    );

-- Tighten DELETE the same way (prior policy used (storage.foldername(name))[1]
-- compared to auth.uid(), which never matched our facility-id path scheme —
-- meaning owners could not delete their own images via that policy. Replace.)
DROP POLICY IF EXISTS "facility_images_bucket_delete" ON storage.objects;

CREATE POLICY "facility_images_bucket_delete" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'facility-images'
        AND EXISTS (
            SELECT 1 FROM public.facilities f
            WHERE f.id::TEXT = (storage.foldername(name))[1]
              AND (f.owner_id = auth.uid() OR public.is_admin())
        )
    );
