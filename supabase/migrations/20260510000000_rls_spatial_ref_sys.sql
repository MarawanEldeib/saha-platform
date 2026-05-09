-- Silences the Supabase Advisor "RLS Disabled in Public" warning on
-- public.spatial_ref_sys. This is the PostGIS reference table holding
-- standard SRID definitions (4326 = WGS84 etc.) — read-only public
-- lookup data, no user information. The risk is zero, but the advisor
-- can't tell the difference, so we enable RLS with a permissive read
-- policy.
--
-- Writes are not policy-allowed here because regular clients should
-- never insert/update/delete spatial references. Supabase admin (service
-- role) bypasses RLS for migrations.

ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spatial_ref_sys_select_public"
    ON public.spatial_ref_sys
    FOR SELECT
    USING (true);
