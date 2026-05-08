-- =============================================================================
-- SAH-81: audit_log table — durable record of admin and finance actions for
-- compliance, dispute defence, and "I never approved this" debugging.
-- Append-only: only INSERT is allowed; admins can SELECT.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID         REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_role  TEXT         NOT NULL,
    action      TEXT         NOT NULL,           -- e.g. 'facility.approve'
    target_type TEXT         NOT NULL,           -- e.g. 'facility'
    target_id   UUID,
    metadata    JSONB,
    ip          TEXT,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor      ON public.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_target     ON public.audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read; nobody can update or delete via RLS.
CREATE POLICY "audit_log_select_admin" ON public.audit_log
    FOR SELECT USING (public.is_admin());

-- Inserts only happen via the service role (admin client) from server actions.
-- No INSERT/UPDATE/DELETE policy for non-service-role contexts.
