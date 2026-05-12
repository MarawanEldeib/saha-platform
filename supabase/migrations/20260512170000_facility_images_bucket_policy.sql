-- =============================================================================
-- SAH-160: Tighten the `facility-images` storage bucket so even direct
-- API uploads (bypassing our /api/facility-images/upload route) can't
-- exceed our limits. Server-side magic-byte verification still lives in
-- the route handler; this is a second line of defense at the bucket.
-- =============================================================================

UPDATE storage.buckets
SET
    file_size_limit = 10485760,                                -- 10 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'facility-images';
