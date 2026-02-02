// service-worker.js
const CACHE_NAME = 'notification-app-v1.2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json'
];

// Install event
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => {
        console.log('[Service Worker] Installed successfully');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[Service Worker] Install failed:', error);
      })
  );
});

// Activate event
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('[Service Worker] Activated successfully');
      return self.clients.claim();
    })
  );
});

// Fetch event
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip Chrome extensions
  if (event.request.url.startsWith('chrome-extension://')) return;
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response if found
        if (response) {
          return response;
        }
        
        // Otherwise fetch from network
        return fetch(event.request)
          .then(response => {
            // Don't cache if not a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response
            const responseToCache = response.clone();
            
            // Cache the new response
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          })
          .catch(error => {
            console.error('[Service Worker] Fetch failed:', error);
            // You could return a custom offline page here
          });
      })
  );
});

// Push event - Handle push notifications
self.addEventListener('push', event => {
  console.log('[Service Worker] Push received');
  
  let data = {
    title: 'การแจ้งเตือนใหม่',
    body: 'คุณมีการแจ้งเตือนใหม่จากเว็บแอป',
    icon: './icons/icon-192x192.png',
    badge: './icons/icon-96x96.png',
    tag: 'push-notification',
    timestamp: Date.now()
  };
  
  // Parse push data
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      console.log('[Service Worker] Push data is not JSON, using text');
      data.body = event.data.text() || data.body;
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    timestamp: data.timestamp,
    data: data.data || {},
    requireInteraction: data.requireInteraction || true,
    actions: data.actions || [
      {
        action: 'open',
        title: 'เปิดแอป'
      },
      {
        action: 'dismiss',
        title: 'ปิด'
      }
    ],
    vibrate: [200, 100, 200]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .then(() => {
        console.log('[Service Worker] Notification shown successfully');
      })
      .catch(error => {
        console.error('[Service Worker] Failed to show notification:', error);
      })
  );
});

// Notification click event
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notification clicked:', event.notification.tag);
  
  event.notification.close();
  
  // Handle action buttons
  if (event.action === 'open') {
    // Open or focus the app
    event.waitUntil(
      clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      })
      .then(clientList => {
        // Check if there's already a window/tab open
        for (const client of clientList) {
          if (client.url === self.registration.scope && 'focus' in client) {
            return client.focus();
          }
        }
        
        // If not, open a new window
        if (clients.openWindow) {
          return clients.openWindow('./');
        }
      })
    );
  } else if (event.action === 'dismiss') {
    // Notification dismissed, do nothing
    console.log('[Service Worker] Notification dismissed');
  } else {
    // Default click behavior (when notification body is clicked)
    event.waitUntil(
      clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      })
      .then(clientList => {
        if (clientList.length > 0) {
          return clientList[0].focus();
        } else {
          return clients.openWindow('./');
        }
      })
    );
  }
});

// Background sync event
self.addEventListener('sync', event => {
  console.log('[Service Worker] Background sync:', event.tag);
  
  if (event.tag === 'sync-notifications') {
    event.waitUntil(
      syncNotifications()
    );
  }
});

// Periodic background sync
self.addEventListener('periodicsync', event => {
  console.log('[Service Worker] Periodic sync:', event.tag);
  
  if (event.tag === 'check-notifications') {
    event.waitUntil(
      checkScheduledNotificationsInBackground()
    );
  }
});

// Message event from the web page
self.addEventListener('message', event => {
  console.log('[Service Worker] Message received:', event.data);
  
  const { type, data, notification } = event.data;
  
  switch (type) {
    case 'SCHEDULE_NOTIFICATION':
      console.log('[Service Worker] Scheduling notification:', notification);
      scheduleBackgroundNotification(notification);
      break;
      
    case 'CANCEL_NOTIFICATION':
      console.log('[Service Worker] Canceling notification:', data.id);
      cancelBackgroundNotification(data.id);
      break;
      
    case 'TEST_NOTIFICATION':
      console.log('[Service Worker] Test notification requested');
      self.registration.showNotification('ทดสอบการแจ้งเตือน', {
        body: 'นี่คือการทดสอบจาก Service Worker',
        icon: './icons/icon-192x192.png',
        tag: 'test-' + Date.now()
      });
      break;
      
    default:
      console.log('[Service Worker] Unknown message type:', type);
  }
});

// Schedule notification in background
function scheduleBackgroundNotification(notification) {
  // Store in IndexedDB for background access
  storeNotificationInDB(notification)
    .then(() => {
      console.log('[Service Worker] Notification scheduled in background:', notification.id);
      
      // Set up periodic checking
      setupPeriodicSync();
    })
    .catch(error => {
      console.error('[Service Worker] Failed to schedule notification:', error);
    });
}

// Cancel notification in background
function cancelBackgroundNotification(notificationId) {
  deleteNotificationFromDB(notificationId)
    .then(() => {
      console.log('[Service Worker] Notification canceled in background:', notificationId);
    })
    .catch(error => {
      console.error('[Service Worker] Failed to cancel notification:', error);
    });
}

// Check scheduled notifications in background
async function checkScheduledNotificationsInBackground() {
  console.log('[Service Worker] Checking scheduled notifications in background');
  
  try {
    const notifications = await getScheduledNotificationsFromDB();
    const now = Date.now();
    
    const dueNotifications = notifications.filter(notification => 
      notification.status === 'scheduled' && 
      notification.scheduledTime <= now
    );
    
    console.log(`[Service Worker] Found ${dueNotifications.length} due notifications`);
    
    for (const notification of dueNotifications) {
      await sendBackgroundNotification(notification);
      
      // Update status
      notification.status = 'sent';
      await updateNotificationInDB(notification);
    }
    
    return dueNotifications.length;
    
  } catch (error) {
    console.error('[Service Worker] Error checking notifications:', error);
    return 0;
  }
}

// Send notification from background
async function sendBackgroundNotification(notification) {
  console.log('[Service Worker] Sending background notification:', notification.title);
  
  const options = {
    body: notification.message,
    icon: './icons/icon-192x192.png',
    badge: './icons/icon-96x96.png',
    tag: notification.id,
    timestamp: notification.scheduledTime,
    requireInteraction: true,
    actions: [
      {
        action: 'open',
        title: 'เปิดแอป'
      },
      {
        action: 'dismiss',
        title: 'ปิด'
      }
    ],
    vibrate: [200, 100, 200, 100, 200]
  };
  
  await self.registration.showNotification(notification.title, options);
  
  // Send message to all clients
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'NOTIFICATION_SENT',
      notification: notification
    });
  });
}

// Setup periodic sync for notifications
function setupPeriodicSync() {
  if ('periodicSync' in self.registration) {
    self.registration.periodicSync.register('check-notifications', {
      minInterval: 5 * 60 * 1000 // Every 5 minutes minimum
    }).then(() => {
      console.log('[Service Worker] Periodic sync registered');
    }).catch(error => {
      console.error('[Service Worker] Periodic sync registration failed:', error);
    });
  }
}

// Sync notifications (for background sync)
async function syncNotifications() {
  console.log('[Service Worker] Syncing notifications');
  
  try {
    // In a real app, you would sync with a server here
    // For now, we'll just check local notifications
    const count = await checkScheduledNotificationsInBackground();
    
    console.log(`[Service Worker] Synced ${count} notifications`);
    
    return count;
    
  } catch (error) {
    console.error('[Service Worker] Sync failed:', error);
    throw error;
  }
}

// IndexedDB functions for background storage
function openNotificationDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NotificationBackgroundDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('notifications')) {
        const store = db.createObjectStore('notifications', { keyPath: 'id' });
        store.createIndex('scheduledTime', 'scheduledTime');
        store.createIndex('status', 'status');
        store.createIndex('createdAt', 'createdAt');
      }
    };
  });
}

async function storeNotificationInDB(notification) {
  const db = await openNotificationDB();
  const tx = db.transaction('notifications', 'readwrite');
  const store = tx.objectStore('notifications');
  
  return new Promise((resolve, reject) => {
    const request = store.put(notification);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getScheduledNotificationsFromDB() {
  const db = await openNotificationDB();
  const tx = db.transaction('notifications', 'readonly');
  const store = tx.objectStore('notifications');
  const index = store.index('status');
  
  return new Promise((resolve, reject) => {
    const request = index.getAll('scheduled');
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function updateNotificationInDB(notification) {
  return storeNotificationInDB(notification);
}

async function deleteNotificationFromDB(notificationId) {
  const db = await openNotificationDB();
  const tx = db.transaction('notifications', 'readwrite');
  const store = tx.objectStore('notifications');
  
  return new Promise((resolve, reject) => {
    const request = store.delete(notificationId);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Check notifications periodically (fallback if periodic sync not available)
setInterval(() => {
  checkScheduledNotificationsInBackground().then(count => {
    if (count > 0) {
      console.log(`[Service Worker] Sent ${count} notifications via interval`);
    }
  });
}, 2 * 60 * 1000); // Check every 2 minutes
