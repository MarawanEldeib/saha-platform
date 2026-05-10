/* eslint-disable */
// SAH-96 PR C: web push service worker.
// Receives push events from the server and shows a notification. Click
// opens the targeted URL (the conversation thread).

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (err) {
        // payload was plain text or malformed — best-effort fallback
        data = { title: 'Saha', body: event.data ? event.data.text() : '' };
    }

    const title = data.title || 'Saha';
    const body = data.body || '';
    const url = data.url || '/';
    const tag = data.tag;

    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            data: { url },
            tag,
            renotify: !!tag,
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        (async () => {
            // Focus an existing window if open on the same origin, else open a new one.
            const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            const targetUrl = new URL(url, self.location.origin).toString();
            for (const client of allClients) {
                if (client.url === targetUrl && 'focus' in client) {
                    return client.focus();
                }
            }
            return self.clients.openWindow(targetUrl);
        })()
    );
});
