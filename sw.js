/**
 * ARC - Service Worker
 * Cache-First offline strategy, Notification Action handling,
 * and IndexedDB task completion on action click.
 */

const CACHE_NAME = 'arc-cache-v1.3.1';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './css/onboarding.css',
  './js/app.js',
  './js/tour-steps.js',
  './js/onboarding.js',
  './js/store.js',
  './js/sound.js',
  './js/shield.js',
  './js/db.js',
  './js/ui.js',
  './js/timer.js',
  './js/notifications.js',
  './js/heatmap.js',
  './js/streak.js',
  './js/settings.js',
  './icons/favicon.svg',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/icon-maskable.svg'
];

// ============================================================================
// INSTALL & PRECACHE
// ============================================================================

self.addEventListener('install', (event) => {
  // Activate immediately without waiting for existing tabs to close
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

// ============================================================================
// ACTIVATE & CLEANUP OLD CACHES
// ============================================================================

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ============================================================================
// FETCH - NETWORK-FIRST FOR HTML, CACHE-FIRST FOR ASSETS
// ============================================================================

self.addEventListener('fetch', (event) => {
  // Only intercept GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. Navigation requests (HTML): Network-First with Cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 2. Google Fonts (cache fonts and stylesheets)
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        }).catch(() => cached);
      })
    );
    return;
  }

  // 3. Static local assets: Cache-First with Network fallback
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});

// ============================================================================
// SKIP WAITING MESSAGE
// ============================================================================

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ============================================================================
// NOTIFICATION CLICK ACTIONS (DONE & SNOOZE)
// ============================================================================

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action;
  const data = event.notification.data || {};
  const taskId = data.taskId;

  if (action === 'done' && taskId) {
    event.waitUntil(
      markTaskCompletedInDB(taskId).then(() => {
        // Broadcast to all open app clients to refresh UI
        return self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'TASK_COMPLETED_VIA_NOTIFICATION', taskId });
          });
        });
      })
    );
  } else if (action === 'snooze' && taskId) {
    // Snooze 10 minutes
    const snoozeTimeMs = Date.now() + 10 * 60 * 1000;
    const taskTitle = data.taskTitle || 'Task';

    event.waitUntil(
      self.registration.showNotification(`ARC // TASK: ${taskTitle.toUpperCase()} (SNOOZED)`, {
        body: 'Snoozed for 10 minutes.',
        icon: 'icons/icon-192.svg',
        badge: 'icons/favicon.svg',
        tag: `task-reminder-${taskId}`,
        vibrate: [200, 100, 200],
        data: { taskId, taskTitle, type: 'task_reminder' },
        actions: [
          { action: 'done', title: 'Done' },
          { action: 'snooze', title: 'Snooze 10m' }
        ]
      })
    );
  } else {
    // User tapped notification body -> focus or open app window
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow('./');
        }
      })
    );
  }
});

/**
 * Directly update task in IndexedDB from the Service Worker
 */
function markTaskCompletedInDB(taskId) {
  return new Promise((resolve) => {
    const request = indexedDB.open('ARC_DB', 1);

    request.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction('tasks', 'readwrite');
      const store = tx.objectStore('tasks');
      const getReq = store.get(taskId);

      getReq.onsuccess = () => {
        const task = getReq.result;
        if (task) {
          task.completed = true;
          task.completedAt = Date.now();
          store.put(task);
        }
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    };

    request.onerror = () => resolve(false);
  });
}
