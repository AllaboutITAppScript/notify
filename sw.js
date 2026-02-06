// Service Worker สำหรับระบบแจ้งเตือน
const CACHE_NAME = 'notification-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png'
];

// ติดตั้ง Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// เปิดใช้งาน
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ดึงข้อมูล
self.addEventListener('fetch', (event) => {
  // ข้าม API calls
  if (event.request.url.includes('script.google.com') || 
      event.request.url.includes('firebase') ||
      event.request.url.includes('fcm.googleapis.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

// จัดการ Push Notifications
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push received', event);
  
  let data = {
    title: 'การแจ้งเตือน',
    body: 'คุณมีการแจ้งเตือนใหม่',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png'
  };
  
  if (event.data) {
    try {
      const json = event.data.json();
      data = { ...data, ...json };
    } catch (e) {
      console.log('Push data error:', e);
      if (event.data.text()) {
        data.body = event.data.text();
      }
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/icon-96x96.png',
    tag: 'notification',
    requireInteraction: data.urgent || false,
    vibrate: data.vibrate || [200, 100, 200],
    data: data.data || {}
  };
  
  // สำหรับการแจ้งเตือนด่วน
  if (data.urgent) {
    options.requireInteraction = true;
    options.vibrate = [500, 200, 500];
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// จัดการการคลิกที่ Notification
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification click', event.notification.data);
  
  event.notification.close();
  
  const urlToOpen = '/';
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      // หาแอปที่เปิดอยู่
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      
      // ถ้าไม่มี ให้เปิดใหม่
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Background Sync
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync', event.tag);
  
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  try {
    // พยายาม sync ข้อมูลเมื่อออนไลน์
    const cache = await caches.open(CACHE_NAME);
    const timestamp = Date.now();
    
    // บันทึกเวลาล่าสุด
    cache.put('/last-sync', new Response(timestamp.toString()));
    
    console.log('Service Worker: Data synced');
  } catch (error) {
    console.error('Service Worker: Sync error', error);
  }
}

// Periodic Background Sync
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-alarms') {
    console.log('Service Worker: Periodic sync for alarms');
    event.waitUntil(checkBackgroundAlarms());
  }
});

async function checkBackgroundAlarms() {
  try {
    // ดึงข้อมูล alarms จาก cache
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match('/alarms-data');
    
    if (response) {
      const alarms = await response.json();
      const now = Date.now();
      
      // ตรวจสอบ alarms ที่ถึงเวลา
      alarms.forEach(alarm => {
        if (!alarm.triggered && new Date(alarm.datetime).getTime() <= now) {
          // แจ้งเตือนใน background
          self.registration.showNotification('แจ้งเตือน: ' + alarm.title, {
            body: alarm.description || 'เวลาแจ้งเตือนถึงแล้ว',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-96x96.png',
            requireInteraction: true,
            vibrate: [500, 200, 500],
            tag: 'alarm-' + alarm.id
          });
        }
      });
    }
  } catch (error) {
    console.error('Service Worker: Check alarms error', error);
  }
}

console.log('Service Worker: Loaded successfully');
