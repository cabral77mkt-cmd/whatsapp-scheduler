import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Inject precache manifest (managed by vite-plugin-pwa)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Cache API leads (offline read-only fallback)
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/crm/leads'),
  new NetworkFirst({
    cacheName: 'crm-leads-cache',
    networkTimeoutSeconds: 4,
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 300 })],
  })
);

// Cache static assets
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 86400 })],
  })
);

/* ── Push Notifications ───────────────────────────────────── */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try { data = event.data.json(); }
  catch { data = { title: 'WA Scheduler', body: event.data.text() }; }

  const title = data.title || '🔔 WA Scheduler';
  const options = {
    body:    data.body  || '',
    icon:    '/favicon.svg',
    badge:   '/favicon.svg',
    data:    { url: data.url || '/' },
    tag:     data.tag   || 'wa-scheduler',
    renotify: true,
    vibrate: [200, 100, 200],
    actions: data.url ? [
      { action: 'open', title: 'Abrir' },
      { action: 'close', title: 'Fechar' },
    ] : [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* ── Notification click ───────────────────────────────────── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const url = event.notification.data?.url || '/';
  const fullUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if possible
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            if ('navigate' in client) client.navigate(fullUrl);
            return;
          }
        }
        // Open new window
        return clients.openWindow(fullUrl);
      })
  );
});
