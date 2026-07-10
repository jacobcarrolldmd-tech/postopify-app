// Postopify Post-Op Medication Tracker - Service Worker
const CACHE_NAME = 'postopify-v3';

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

// Track scheduled timers (with their tag) so we can clear them on reschedule.
// Each entry is { tag, timer }. Tags are prefixed by profile id
// (e.g. "p_abc123-ibu0") so one patient's reminders can be cleared/
// rescheduled without touching another's, letting both stay armed at once.
let scheduledTimers = [];

// Handle scheduled notifications via postMessage
// Accepts BOTH 'SCHEDULE' and 'SCHEDULE_NOTIFICATION' for compatibility
self.addEventListener('message', event => {
  const data = event.data || {};

  if (data.type === 'CLEAR') {
    if (data.profileId) {
      // Scoped clear: only cancel this profile's own tagged timers
      const prefix = data.profileId + '-';
      scheduledTimers = scheduledTimers.filter(function(entry) {
        if (entry.tag && entry.tag.indexOf(prefix) === 0) {
          clearTimeout(entry.timer);
          return false;
        }
        return true;
      });
    } else {
      // No profileId given: clear everything (legacy behavior)
      scheduledTimers.forEach(function(entry){ clearTimeout(entry.timer); });
      scheduledTimers = [];
    }
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
    scheduledTimers.push({ tag: tag, timer: timer });
  }
});
