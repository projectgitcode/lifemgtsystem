# Supabase setup

## Direct Messages

Run `messages.sql` in the Supabase SQL Editor once. It creates:

- `profiles` — searchable account directory (email + optional display name)
- `direct_messages` — account-to-account chat messages
- RLS policies so only participants can read/update/delete messages and only the signed-in account can send as itself
- Supabase Realtime for new message inserts

After running the SQL, redeploy the GitHub Pages project. The Messages tab will appear for signed-in users.

The app automatically upserts the current user's profile when the account enters the authenticated app.
