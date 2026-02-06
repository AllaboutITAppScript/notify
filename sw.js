// Service Worker สำหรับการแจ้งเตือนในเบื้องหลัง
const CACHE_NAME = 'notification-system-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// ติดตั้ง Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// เปิดใช้งาน Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker: Activated');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// จัดการ fetch requests
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});

// จัดการการแจ้งเตือนแบบ Push
self.addEventListener('push', event => {
  console.log('Service Worker: Push Received');
  
  let data = {
    title: 'การแจ้งเตือนใหม่',
    message: 'คุณมีการแจ้งเตือนใหม่',
    icon: '/icon-192.png'
  };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.message = event.data.text();
    }
  }
  
  const options = {
    body: data.message,
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      timestamp: Date.now()
    },
    actions: [
      {
        action: 'open',
        title: 'เปิดแอป'
      },
      {
        action: 'close',
        title: 'ปิด'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// จัดการการคลิกที่การแจ้งเตือน
self.addEventListener('notificationclick', event => {
  console.log('Service Worker: Notification clicked');
  
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      clients.matchAll({ type: 'window' })
        .then(clientList => {
          for (const client of clientList) {
            if (client.url === '/' && 'focus' in client) {
              return client.focus();
            }
          }
          if (clients.openWindow) {
            return clients.openWindow('/');
          }
        })
    );
  } else if (event.action === 'close') {
    // ไม่ทำอะไร
  } else {
    // คลิกที่ตัว notification
    event.waitUntil(
      clients.matchAll({ type: 'window' })
        .then(clientList => {
          for (const client of clientList) {
            if (client.url === '/' && 'focus' in client) {
              return client.focus();
            }
          }
          if (clients.openWindow) {
            return clients.openWindow('/');
          }
        })
    );
  }
});

// Background Sync
self.addEventListener('sync', event => {
  console.log('Service Worker: Background sync', event.tag);
  
  if (event.tag === 'sync-alarms') {
    event.waitUntil(syncAlarms());
  }
});

// ฟังก์ชันซิงค์ alarms
async function syncAlarms() {
  try {
    const response = await fetch('https://script.google.com/macros/s/AKfycbwpOYJ_pB6Llu9bd7RJABMd0awxu09oVFPB1cK4zsq3-aBYze5EpSHTSGgO1EcSJ3DwpQ/exec?action=get_alarms');
    if (response.ok) {
      const data = await response.json();
      // เก็บข้อมูลใน IndexedDB หรือ Cache
      console.log('Background sync สำเร็จ:', data);
    }
  } catch (error) {
    console.error('Background sync ล้มเหลว:', error);
  }
}
