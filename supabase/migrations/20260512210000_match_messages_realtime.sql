-- =============================================================================
-- SAH-152 Phase 6: enable Supabase Realtime on match_messages so the
-- MatchChat client component can replace its 8 s poll with a real-time
-- websocket subscription (postgres_changes → INSERT).
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.match_messages;
