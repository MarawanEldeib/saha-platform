-- Sport suggestions: logged when a business selects "Other" and types a sport name.
-- Admin can promote high-count suggestions to real sports categories.

CREATE TABLE IF NOT EXISTS public.sport_suggestions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id uuid REFERENCES public.facilities(id) ON DELETE CASCADE,
    suggested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    name        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for admin to see frequency
CREATE INDEX IF NOT EXISTS sport_suggestions_name_idx ON public.sport_suggestions (lower(name));

ALTER TABLE public.sport_suggestions ENABLE ROW LEVEL SECURITY;

-- Business owners can insert their own suggestions
CREATE POLICY "owners can suggest sports"
ON public.sport_suggestions FOR INSERT
WITH CHECK (auth.uid() = suggested_by);

-- Admins can read all suggestions (via service role or admin role check)
CREATE POLICY "admins can read suggestions"
ON public.sport_suggestions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);
