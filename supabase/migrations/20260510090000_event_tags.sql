-- SAH-146: event tags — culturally-aware controlled vocabulary for events.
--
-- Tags are stored as a TEXT[] on events. A CHECK constraint pins the
-- vocabulary so admins/owners can't drift to free-form values that miss
-- the filter UI. women_only / men_only overlap with the upcoming session-
-- type work (SAH-144); whichever ships first owns the canonical surface.

ALTER TABLE public.events
    ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.events
    ADD CONSTRAINT events_tags_valid CHECK (
        tags <@ ARRAY[
            'family_friendly',
            'no_music',
            'ramadan_friendly_hours',
            'post_taraweeh',
            'ramadan_fitness',
            'women_only',
            'men_only'
        ]::text[]
    );

-- GIN index supports fast `tags && ARRAY[...]` containment filters on /events.
CREATE INDEX idx_events_tags ON public.events USING GIN (tags);
