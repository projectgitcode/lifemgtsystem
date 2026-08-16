# Life Management v29 — Notifications Setup

## GitHub
Replace the existing repository files with this package. The new files are `js/notifications.js`, `css/notifications.css`, `sw.js`, and the `supabase/` notification files.

## Supabase SQL
Run `supabase/notifications.sql` once. It is safe for the existing chat table: it does **not** drop or recreate `direct_messages`, and it does not re-add `direct_messages` to Realtime.

## Web Push
The client uses Web Push with the matching VAPID public key. The private key is **not** in the frontend.

Public key:
`BA0cxGOHpYIvMApOwhCdEcM16sAhjV7inrCNCNV9eDmc-v_HJfV7zp8J78CeGGGoztxFTauXOHf5DmOC47CBC9k`

Private key is provided separately in `VAPID-PRIVATE-KEY.txt`. Do not commit that file to GitHub.

Deploy `supabase/functions/push-notification` as an Edge Function and set the required secrets. Then create a Database Webhook for INSERT on `public.notifications` pointing to the function.

Supabase documents this Database Webhook → Edge Function pattern for push notifications.

## Home notifications
v29 supports per-category preferences and an Edge Function entry point for scheduled Home notifications. The included `generate-home-notifications` function currently schedules calendar items conservatively. Expand it for your final Home-state fields after confirming the exact current state schema. This avoids silently inventing notification timing rules.

## Security
Never put `SUPABASE_SERVICE_ROLE_KEY` or `VAPID_PRIVATE_KEY` in GitHub or browser JavaScript.
