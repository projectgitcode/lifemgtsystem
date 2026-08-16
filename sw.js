const CACHE = 'life-management-shell-v62';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

/* ---------- INSTALL ---------- */

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

/* ---------- ACTIVATE ---------- */

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ---------- FETCH ---------- */

self.addEventListener('fetch', event => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(response => {
        const copy = response.clone();

        caches.open(CACHE)
          .then(cache => cache.put(req, copy))
          .catch(() => {});

        return response;
      })
      .catch(() =>
        caches.match(req)
          .then(cached =>
            cached || caches.match('./index.html')
          )
      )
  );
});

/* ---------- WEB PUSH ---------- */

self.addEventListener('push', event => {
  console.log('[Life Management SW] PUSH RECEIVED');

  let payload = {};

  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch (e) {
    try {
      payload = {
        body: event.data ? event.data.text() : ''
      };
    } catch (_) {
      payload = {};
    }
  }

  const title =
    payload.title ||
    'Life Management';

  const body =
    payload.body ||
    'You have a new notification.';

  const data =
    payload.data ||
    {};

  const notificationId =
    payload.notification_id ||
    data.notification_id ||
    '';

  const targetUrl =
    data.url ||
    './';

  const options = {
    body,
    icon: './assets/icons/icon-192.png',
    badge: './assets/icons/icon-192.png',
    tag: notificationId
      ? 'life-notification-' + notificationId
      : 'life-notification',
    renotify: true,
    requireInteraction: false,
    data: {
      ...data,
      url: targetUrl,
      notification_id: notificationId
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/* ---------- NOTIFICATION CLICK ---------- */

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const targetUrl =
    event.notification?.data?.url || './';

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    })
    .then(clientList => {

      for (const client of clientList) {
        if ('focus' in client) {
          return client.navigate(targetUrl).then(() => client.focus());
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }

      return null;
    })
  );
});
