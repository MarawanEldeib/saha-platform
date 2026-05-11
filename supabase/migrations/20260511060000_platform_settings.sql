-- SAH-141: platform-wide configuration table.
--
-- Settings are typed at read time (helpers in src/lib/platform-settings.ts).
-- All values stored as JSONB so we can mix number / string / boolean / object
-- without per-key columns.
--
-- Updates are gated by admin RLS at the DB level. The service-role client
-- bypasses RLS but the admin server actions add an additional role check
-- (assertAdmin) before writing.

CREATE TABLE IF NOT EXISTS public.platform_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_settings_select_admin"
    ON public.platform_settings
    FOR SELECT
    USING (public.is_admin());

CREATE POLICY "platform_settings_write_admin"
    ON public.platform_settings
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Seed the initial set so the reader never has to fall back to defaults
-- when admins haven't visited the page yet.
INSERT INTO public.platform_settings (key, value) VALUES
    ('platform_fee_percent',        '10'::jsonb),
    ('default_currency',            '"AED"'::jsonb),
    ('min_booking_lead_minutes',    '60'::jsonb),
    ('cancel_refund_window_hours',  '24'::jsonb),
    ('loyalty_threshold',           '10'::jsonb),
    ('feature_events',              'true'::jsonb),
    ('feature_community',           'true'::jsonb),
    ('feature_group_booking',       'true'::jsonb),
    ('feature_messaging',           'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
