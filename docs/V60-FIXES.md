# Life Management v60 fixes

- Password recovery redirect is derived from the deployed app URL instead of a hard-coded GitHub Pages repository path.
- Supabase Auth URL Configuration must allow the exact deployed app URL, including the trailing slash.
- Explicitly enabling phone push now renews the browser PushSubscription, which fixes stale subscriptions after VAPID key rotation.
- The push Edge Function logs the actual push-service status/body and removes stale 401/404/410 subscriptions.

Do not commit `VAPID_PRIVATE_KEY` to GitHub. Keep it in Supabase Edge Function Secrets.
