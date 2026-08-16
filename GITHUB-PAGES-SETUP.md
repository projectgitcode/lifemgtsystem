# Life Management — GitHub Pages Setup

## 1. Create a GitHub repository
Create a new repository, for example `life-management`.

## 2. Upload everything in this folder
Upload the contents of this folder, preserving the folders:

- `index.html`
- `css/`
- `js/`
- `assets/`
- `manifest.webmanifest`
- `sw.js`
- `.nojekyll`

Do not upload the ZIP itself as the only file. GitHub Pages needs the project files extracted in the repository.

## 3. Enable GitHub Pages
GitHub → repository → Settings → Pages

- Source: **Deploy from a branch**
- Branch: **main**
- Folder: **/ (root)**
- Save

Wait for the Pages URL to become available.

## 4. Configure Supabase Auth
In Supabase Dashboard → Authentication → URL Configuration:

- Set **Site URL** to your GitHub Pages URL.
- Add the exact GitHub Pages URL under **Redirect URLs**.

Example:
`https://YOUR-USERNAME.github.io/life-management/`

The app already sends the current deployed URL to Supabase for password-reset redirects.

## 5. Open the app using HTTPS
Use the GitHub Pages URL. Do not open `index.html` directly with `file://`.

This is required for the PWA/service-worker features and is also the correct environment for browser notification permission.

## 6. Install on phone
On the deployed HTTPS URL:

- Android Chrome: browser menu → Add to Home screen / Install app.
- iPhone Safari: Share → Add to Home Screen.

The app icons are in `assets/icons/` and are referenced by the manifest.

## 7. Phone notifications
The current app requests notification permission and can display Home notifications through the browser/service worker. True push delivery while the app is completely closed still requires a Web Push subscription + VAPID sender (for example a Supabase Edge Function).
