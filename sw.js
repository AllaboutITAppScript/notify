// Service Worker สำหรับระบบแจ้งเตือนข้ามเครื่อง
const CACHE_NAME = 'notification-system-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// ติดตั้ง Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// เปิดใช้งาน Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ดึงข้อมูลจาก cache หรือ network
self.addEventListener('fetch', event => {
  // ข้ามการ cache สำหรับ Google Script calls
  if (event.request.url.includes('script.google.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(response => {
          // Cache dynamic content
          if (event.request.url.startsWith('http') && 
              (event.request.method === 'GET')) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
      .catch(() => {
        // สำหรับ offline: แสดงหน้า offline
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
      })
  );
});

// จัดการ Push Notifications
self.addEventListener('push', event => {
  console.log('📨 Push notification received:', event);
  
  let data = {
    title: 'ระบบแจ้งเตือนข้ามเครื่อง',
    body: 'คุณมีการแจ้งเตือนใหม่',
    icon: '/icon-192x192.png',
    badge: '/icon-96x96.png',
    tag: 'cross-device-notification'
  };
  
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      console.log('Error parsing push data:', e);
      if (event.data.text()) {
        data.body = event.data.text();
      }
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon || '/icon-192x192.png',
    badge: data.badge || '/icon-96x96.png',
    tag: data.tag || 'notification',
    requireInteraction: data.important || data.type === 'alarm',
    vibrate: data.vibrate || [200, 100, 200],
    data: {
      url: data.url || '/',
      type: data.type || 'notification',
      timestamp: Date.now(),
      alarm_id: data.alarm_id,
      broadcast_id: data.broadcast_id,
      urgent: data.urgent || false
    },
    actions: [
      {
        action: 'view',
        title: 'เปิดดู'
      },
      {
        action: 'dismiss',
        title: 'ปิด'
      }
    ]
  };
  
  // เพิ่มภาพสำหรับ Desktop notifications
  if (data.image) {
    options.image = data.image;
  }
  
  // สำหรับ urgent notifications
  if (data.urgent) {
    options.requireInteraction = true;
    options.vibrate = [500, 200, 500];
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// จัดการการคลิกที่ Notification
self.addEventListener('notificationclick', event => {
  console.log('🖱️ Notification clicked:', event.notification.data);
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  const urlToOpen = event.notification.data.url || '/';
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(clientList => {
      // หา client ที่เปิดอยู่แล้ว
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          client.focus();
          
          // ส่งข้อความไปยัง client
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: event.notification.data
          });
          
          return;
        }
      }
      
      // ถ้าไม่มี client อยู่ ให้เปิดใหม่
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen).then(newClient => {
          if (newClient) {
            // รอให้หน้าโหลดแล้วส่งข้อความ
            setTimeout(() => {
              newClient.postMessage({
                type: 'NOTIFICATION_CLICKED',
                data: event.notification.data
              });
            }, 1000);
          }
        });
      }
    })
  );
});

// Background Sync
self.addEventListener('sync', event => {
  console.log('🔄 Background sync:', event.tag);
  
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
  
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotifications());
  }
});

// Periodic Sync (ทุก 1 ชั่วโมง)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'hourly-sync') {
    console.log('⏰ Periodic sync triggered');
    event.waitUntil(periodicSync());
  }
});

// ฟังก์ชัน Sync
async function syncData() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const responses = await Promise.all([
      fetch('/api/sync/alarms').catch(() => null),
      fetch('/api/sync/broadcasts').catch(() => null)
    ]);
    
    // บันทึกข้อมูลลง cache
    responses.forEach((response, index) => {
      if (response && response.ok) {
        const urls = ['/api/alarms', '/api/broadcasts'];
        cache.put(urls[index], response);
      }
    });
    
    console.log('✅ Background sync completed');
  } catch (error) {
    console.error('❌ Background sync error:', error);
  }
}

async function syncNotifications() {
  try {
    // ดึง notifications ใหม่จากเซิร์ฟเวอร์
    const response = await fetch('/api/notifications/latest');
    if (response.ok) {
      const notifications = await response.json();
      
      // แสดง notifications ใหม่
      notifications.forEach(notification => {
        self.registration.showNotification(notification.title, {
          body: notification.message,
          icon: '/icon-192x192.png',
          tag: `notification-${notification.id}`,
          data: {
            type: notification.type,
            url: '/#notifications'
          }
        });
      });
    }
  } catch (error) {
    console.error('Sync notifications error:', error);
  }
}

async function periodicSync() {
  await syncData();
  await syncNotifications();
}

// รับข้อความจาก client
self.addEventListener('message', event => {
  console.log('📩 Message from client:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'REGISTER_DEVICE') {
    registerDevice(event.data.payload);
  }
  
  if (event.data.type === 'SYNC_REQUEST') {
    syncData();
  }
});

async function registerDevice(payload) {
  try {
    const response = await fetch('/api/device/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      console.log('✅ Device registered via Service Worker');
    }
  } catch (error) {
    console.error('❌ Device registration error:', error);
  }
}

// จัดการการออฟไลน์
self.addEventListener('fetch', event => {
  if (!navigator.onLine && event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/').then(response => {
        if (response) {
          return response;
        }
        return new Response('You are offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/html'
          })
        });
      })
    );
  }
});

console.log('🚀 Service Worker loaded successfully');
