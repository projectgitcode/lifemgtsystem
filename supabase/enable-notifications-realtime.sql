-- Life Management v61
-- Enable Supabase Realtime for the in-app notification center.
-- This is NOT required for Web Push delivery while the app is closed.
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
