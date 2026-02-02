// service-worker.js
const CACHE_NAME = 'notification-app-v3.0';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/firebase-config.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install Service Worker
self.addEventListener('install', event => {
  console.log('[Service Worker] กำลังติดตั้ง...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] แคชไฟล์แอป');
        return cache.addAll(APP_SHELL);
      })
      .then(() => {
        console.log('[Service Worker] ติดตั้งสำเร็จ');
        return self.skipWaiting();
      })
  );
});

// Activate Service Worker
self.addEventListener('activate', event => {
  console.log('[Service Worker] กำลังเปิดใช้งาน...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] ลบแคชเก่า:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('[Service Worker] เปิดใช้งานสำเร็จ');
      return self.clients.claim();
    })
  );
});

// Handle Push Notifications
self.addEventListener('push', event => {
  console.log('[Service Worker] ได้รับ Push Notification');
  
  let data = {
    title: 'การแจ้งเตือนใหม่',
    body: 'คุณมีการแจ้งเตือนใหม่จากแอป',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: 'push-notification',
    timestamp: Date.now(),
    requireInteraction: true,
    vibrate: [200, 100, 200]
  };
  
  // Parse push data
  if (event.data) {
    try {
      const pushData = event.data.json();
      data = { ...data, ...pushData };
    } catch (e) {
      console.log('[Service Worker] ข้อมูล Push ไม่ใช่ JSON');
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
    actions: [
      {
        action: 'view',
        title: 'ดู'
      },
      {
        action: 'close',
        title: 'ปิด'
      }
    ],
    vibrate: [200, 100, 200, 100, 200],
    silent: false
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle Notification Click
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] คลิกที่ Notification:', event.notification.tag);
  
  event.notification.close();
  
  // Handle action buttons
  if (event.action === 'view') {
    // Open or focus the app
    event.waitUntil(
      clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      })
      .then(clientList => {
        // Find app window
        for (const client of clientList) {
          if (client.url.includes(self.registration.scope) && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  } else if (event.action === 'close') {
    // Just close the notification
    console.log('[Service Worker] ปิดการแจ้งเตือน');
  } else {
    // Default click (notification body)
    event.waitUntil(
      clients.matchAll({
        type: 'window'
      })
      .then(clientList => {
        if (clientList.length > 0) {
          return clientList[0].focus();
        } else {
          return clients.openWindow('/');
        }
      })
    );
  }
  
  // Send message to page
  event.waitUntil(
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'NOTIFICATION_CLICKED',
          notification: event.notification
        });
      });
    })
  );
});

// Handle Background Sync
self.addEventListener('sync', event => {
  console.log('[Service Worker] Background Sync:', event.tag);
  
  if (event.tag === 'sync-notifications') {
    event.waitUntil(
      syncNotifications()
    );
  }
});

// Sync notifications
async function syncNotifications() {
  console.log('[Service Worker] กำลังซิงค์การแจ้งเตือน...');
  
  try {
    // Get pending notifications from IndexedDB
    const pendingNotifications = await getPendingNotifications();
    
    if (pendingNotifications.length > 0) {
      // Send to server
      await sendNotificationsToServer(pendingNotifications);
      
      // Clear pending notifications
      await clearPendingNotifications();
      
      console.log(`[Service Worker] ซิงค์สำเร็จ: ${pendingNotifications.length} การแจ้งเตือน`);
    }
    
    return true;
  } catch (error) {
    console.error('[Service Worker] ซิงค์ล้มเหลว:', error);
    return false;
  }
}

// Handle messages from page
self.addEventListener('message', event => {
  console.log('[Service Worker] ได้รับข้อความ:', event.data);
  
  const { type, data } = event.data;
  
  switch (type) {
    case 'SCHEDULE_NOTIFICATION':
      scheduleBackgroundNotification(data);
      break;
      
    case 'GET_NOTIFICATIONS':
      event.ports[0].postMessage({ notifications: [] });
      break;
      
    default:
      console.log('[Service Worker] ประเภทข้อความไม่รู้จัก:', type);
  }
});

// Schedule notification in background
function scheduleBackgroundNotification(notification) {
  console.log('[Service Worker] ตั้งเวลาในพื้นหลัง:', notification);
  
  // Save to IndexedDB
  saveToIndexedDB('pending_notifications', notification)
    .then(() => {
      console.log('[Service Worker] บันทึกการแจ้งเตือนรอดำเนินการ');
      
      // Register sync
      if ('SyncManager' in self.registration) {
        self.registration.sync.register('sync-notifications')
          .then(() => {
            console.log('[Service Worker] ลงทะเบียน Background Sync');
          });
      }
    })
    .catch(error => {
      console.error('[Service Worker] บันทึกล้มเหลว:', error);
    });
}

// IndexedDB Helper Functions
async function saveToIndexedDB(storeName, data) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NotificationDB', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
      }
      
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const addRequest = store.add(data);
      
      addRequest.onsuccess = () => resolve();
      addRequest.onerror = () => reject(addRequest.error);
    };
  });
}

async function getPendingNotifications() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NotificationDB', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('pending_notifications')) {
        resolve([]);
        return;
      }
      
      const transaction = db.transaction(['pending_notifications'], 'readonly');
      const store = transaction.objectStore('pending_notifications');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => resolve(getAllRequest.result || []);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
  });
}

async function clearPendingNotifications() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NotificationDB', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('pending_notifications')) {
        resolve();
        return;
      }
      
      const transaction = db.transaction(['pending_notifications'], 'readwrite');
      const store = transaction.objectStore('pending_notifications');
      const clearRequest = store.clear();
      
      clearRequest.onsuccess = () => resolve();
      clearRequest.onerror = () => reject(clearRequest.error);
    };
  });
}

async function sendNotificationsToServer(notifications) {
  // In production, send to your server
  console.log('[Service Worker] ส่งการแจ้งเตือนไปเซิร์ฟเวอร์:', notifications);
  
  // Simulate server call
  return new Promise(resolve => {
    setTimeout(() => {
      console.log('[Service Worker] ส่งสำเร็จ');
      resolve();
    }, 1000);
  });
}

// Periodic background task (check every 5 minutes)
setInterval(async () => {
  console.log('[Service Worker] ตรวจสอบพื้นหลัง...');
  
  // Check for scheduled notifications
  const pending = await getPendingNotifications();
  
  if (pending.length > 0) {
    console.log(`[Service Worker] พบ ${pending.length} การแจ้งเตือนรอดำเนินการ`);
  }
}, 5 * 60 * 1000);
