# Life Management v61 — Push revision

- Settings now has a single **Enable Phone Notifications** action; the separate on/off/disable button was removed.
- Explicitly enabling push always renews the browser PushSubscription so stale subscriptions and old VAPID subscriptions are not reused.
- VAPID public key remains the new key configured for this project.
- Service-worker cache bumped to v61.
- The Supabase Edge Function from v60 already removes 404/410/401 stale device subscriptions and logs the actual push error. No new database table is required.

## Database / Realtime

`notification_devices` showing **0 rows** means there is currently no registered push device for the user. That is expected after removing the stale subscription; the app will create a new row when Enable Phone Notifications is pressed.

The **Realtime Disabled** label on a table is separate from Web Push. Web Push delivery does not require Realtime on `notification_devices`. For the in-app notification center to receive live `notifications` INSERT events, enable Realtime for the `public.notifications` table.
