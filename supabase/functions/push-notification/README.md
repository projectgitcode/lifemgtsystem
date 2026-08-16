# push-notification

Deploy this Supabase Edge Function and set these secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (for example `mailto:you@example.com`)

The v29 client already contains the matching public VAPID key.

Create a Database Webhook for `public.notifications` → INSERT → this Edge Function.
Supabase's documented push-notification pattern uses Database Webhooks to invoke an Edge Function. See the official docs.


Current client VAPID public key: `BA0cxGOHpYIvMApOwhCdEcM16sAhjV7inrCNCNV9eDmc-v_HJfV7zp8J78CeGGGoztxFTauXOHf5DmOC47CBC9k`
