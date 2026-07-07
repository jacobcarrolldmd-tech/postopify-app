// Postopify Post-Op Medication Tracker - Service Worker
const CACHE_NAME = 'postopify-v2';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});

// Track scheduled timers so we can clear them on reschedule
let scheduledTimers = [];

// Handle scheduled notifications via postMessage
// Accepts BOTH 'SCHEDULE' and 'SCHEDULE_NOTIFICATION' for compatibility
self.addEventListener('message', event => {
  const data = event.data || {};

  if (data.type === 'CLEAR') {
    scheduledTimers.forEach(function(t){ clearTimeout(t); });
    scheduledTimers = [];
    return;
  }

  if (data.type === 'SCHEDULE' || data.type === 'SCHEDULE_NOTIFICATION') {
    const title = data.title || 'Medication Reminder';
    const body  = data.body || 'Time to take your medication.';
    const delay = data.delay || 0;
    const tag   = data.tag || ('dose-' + Date.now());
    if (delay < 0) return;

    const timer = setTimeout(() => {
      self.registration.showNotification(title, {
        body: body,
        icon: './icon.png',
        badge: './icon.png',
        tag: tag,
        renotify: true,
        requireInteraction: true,
        silent: false,
        vibrate: [400, 150, 400, 150, 400],
        actions: [
          { action: 'taken', title: 'Taken' },
          { action: 'snooze', title: 'Snooze 30 min' }
        ]
      });
    }, delay);
    scheduledTimers.push(timer);
  }
});
