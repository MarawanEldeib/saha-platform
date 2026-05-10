-- SAH-96 PR B: enable Realtime broadcasts on the messages table.
--
-- Supabase auto-creates the `supabase_realtime` publication; we just opt
-- the messages table into it. RLS on messages still applies — clients
-- only receive INSERT events for messages they're allowed to SELECT.

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
