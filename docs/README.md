# Life Management v23

## Structure
- `index.html` — application shell
- `js/app.js` — application JavaScript/state/UI logic
- `css/` — extracted stylesheets
- `utilities/` — reserved for reusable helpers
- `assets/` — static assets
- `supabase/` — Supabase-related project files
- `manifest.webmanifest` — PWA manifest
- `sw.js` — service worker
- `assets/icons/` — app icons

## Deploy
Deploy the folder as a static site. Keep all files at these relative paths so the PWA manifest, icons, CSS, JS, and service worker resolve correctly.

For PWA installation and service-worker behavior, the site must be served over HTTPS (except localhost).
