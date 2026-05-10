-- SAH-144: family + gender comfort session labels.
--
-- Adds a session_type tag to each generated time slot so facilities can
-- surface "women only", "men only", "family", or default "mixed" sessions
-- to players. Stored on court_availability (per slot) — simpler than a
-- new rules table and matches how owners already think in slots when
-- they configure availability.
--
-- women_only / men_only overlap with SAH-146's events.tags vocabulary;
-- the enum here is the canonical surface for slot-level segmentation.

CREATE TYPE public.session_type AS ENUM (
    'mixed',
    'family',
    'women_only',
    'men_only'
);

ALTER TABLE public.court_availability
    ADD COLUMN session_type public.session_type NOT NULL DEFAULT 'mixed';

CREATE INDEX idx_court_availability_session_type
    ON public.court_availability(session_type)
    WHERE session_type <> 'mixed';
