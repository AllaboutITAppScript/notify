// Service Worker สำหรับระบบแจ้งเตือนข้ามเครื่อง
const CACHE_NAME = 'notification-system-v4';
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
  console.log('📦 Installing Service Worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('✅ Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ All resources cached');
        return self.skipWaiting();
      })
  );
});

// เปิดใช้งาน Service Worker
self.addEventListener('activate', (event) => {
  console.log('🚀 Activating Service Worker...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker activated');
      return self.clients.claim();
    })
  );
});

// ดึงข้อมูลจาก cache หรือ network
self.addEventListener('fetch', (event) => {
  // ข้ามการ cache สำหรับ API calls
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
        
        return fetch(event.request).then((response) => {
          // Cache dynamic content
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
          
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

// จัดการ Push Notifications (สำหรับ Firebase)
self.addEventListener('push', (event) => {
  console.log('📨 Push notification received in SW:', event);
  
  let data = {
    title: 'ระบบแจ้งเตือน',
    body: 'คุณมีการแจ้งเตือนใหม่',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: 'notification'
  };
  
  if (event.data) {
    try {
      const jsonData = event.data.json();
      data = { ...data, ...jsonData };
    } catch (e) {
      console.log('Error parsing push data:', e);
      if (event.data.text()) {
        data.body = event.data.text();
      }
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    requireInteraction: data.urgent || false,
    vibrate: data.vibrate || [200, 100, 200],
    data: {
      url: data.url || '/',
      type: data.type || 'notification',
      timestamp: Date.now(),
      ...data.data
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
  
  // สำหรับ urgent notifications
  if (data.urgent) {
    options.requireInteraction = true;
    options.vibrate = [500, 200, 500, 200, 500];
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// จัดการการคลิกที่ Notification
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ Notification clicked in SW:', event.notification.data);
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  const urlToOpen = event.notification.data.url || '/';
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
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
        return clients.openWindow(urlToOpen).then((newClient) => {
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
self.addEventListener('sync', (event) => {
  console.log('🔄 Background sync:', event.tag);
  
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

// Periodic Sync (ทุก 1 ชั่วโมง)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'hourly-sync') {
    console.log('⏰ Periodic sync triggered');
    event.waitUntil(periodicSync());
  }
});

// ฟังก์ชัน Sync ข้อมูล
async function syncData() {
  try {
    // ดึงข้อมูลจากเซิร์ฟเวอร์
    const responses = await Promise.all([
      fetch('/api/sync/alarms'),
      fetch('/api/sync/broadcasts')
    ]);
    
    // บันทึกข้อมูลลง cache
    const cache = await caches.open(CACHE_NAME);
    responses.forEach(async (response, index) => {
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

async function periodicSync() {
  await syncData();
  
  // แจ้งเตือนถ้ามีข้อมูลใหม่
  try {
    const response = await fetch('/api/check-updates');
    const data = await response.json();
    
    if (data.hasUpdates) {
      self.registration.showNotification('มีข้อมูลใหม่', {
        body: 'มีข้อมูลใหม่ที่รอการอัปเดต',
        icon: '/icons/icon-192x192.png',
        tag: 'update'
      });
    }
  } catch (error) {
    console.error('❌ Periodic sync error:', error);
  }
}

// รับข้อความจาก client
self.addEventListener('message', (event) => {
  console.log('📩 Message from client:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CACHE_DATA') {
    cacheData(event.data.payload);
  }
  
  if (event.data.type === 'GET_CACHED_DATA') {
    getCachedData(event.data.key).then((data) => {
      event.ports[0].postMessage({ data: data });
    });
  }
});

async function cacheData(payload) {
  const cache = await caches.open(CACHE_NAME);
  const response = new Response(JSON.stringify(payload.data));
  await cache.put(payload.key, response);
  console.log('✅ Data cached:', payload.key);
}

async function getCachedData(key) {
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(key);
  
  if (response) {
    return await response.json();
  }
  
  return null;
}

// จัดการการออฟไลน์
self.addEventListener('fetch', (event) => {
  if (!navigator.onLine && event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/').then((response) => {
        if (response) {
          return response;
        }
        return new Response(
          '<h1>คุณออฟไลน์</h1><p>แอปพลิเคชันนี้ต้องใช้การเชื่อมต่ออินเทอร์เน็ต</p>',
          {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/html'
            })
          }
        );
      })
    );
  }
});

console.log('🚀 Service Worker loaded successfully');
