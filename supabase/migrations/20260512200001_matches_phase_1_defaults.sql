-- =============================================================================
-- SAH-152 Phase 1 (followup): set defaults on the new matchmaking_posts
-- columns so legacy `/community` inserts (which only know the old columns)
-- keep working until Phase 2 replaces that form with `/matches/new`.
-- =============================================================================

ALTER TABLE public.matchmaking_posts
    ALTER COLUMN title         SET DEFAULT 'Match',
    ALTER COLUMN scheduled_for SET DEFAULT (CURRENT_DATE + INTERVAL '1 day' + TIME '18:00')::timestamptz,
    ALTER COLUMN format        SET DEFAULT 'casual',
    ALTER COLUMN capacity      SET DEFAULT 4,
    ALTER COLUMN status        SET DEFAULT 'open',
    ALTER COLUMN gate          SET DEFAULT 'open';

-- Trigger: legacy `/community` inserts pass `message` but not `title`. When
-- the row arrives with the literal default 'Match', overwrite it with the
-- first 60 chars of `message` so the feed cards stay readable. Phase 2's
-- `/matches/new` will set title explicitly and skip this branch.
CREATE OR REPLACE FUNCTION public.matchmaking_posts_default_title()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.title IS NULL OR NEW.title = 'Match' THEN
        NEW.title := LEFT(NEW.message, 60);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matchmaking_posts_default_title_trg ON public.matchmaking_posts;
CREATE TRIGGER matchmaking_posts_default_title_trg
    BEFORE INSERT ON public.matchmaking_posts
    FOR EACH ROW
    EXECUTE FUNCTION public.matchmaking_posts_default_title();
