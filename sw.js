// Service Worker สำหรับการแจ้งเตือนแบบ Background
const CACHE_NAME = 'notification-system-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// ติดตั้ง Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Cache ถูกเปิดแล้ว');
        return cache.addAll(urlsToCache);
      })
  );
});

// แอคติเวท Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ ลบ cache เก่า:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// ดึงข้อมูลจาก cache หรือ network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

// จัดการ Push Notifications
self.addEventListener('push', event => {
  console.log('📢 ได้รับ Push Notification:', event);
  
  let data = {
    title: 'ระบบแจ้งเตือน',
    body: 'คุณมีการแจ้งเตือนใหม่',
    icon: '/icon-192.png',
    badge: '/badge-96.png'
  };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      console.log('❌ ไม่สามารถอ่านข้อมูล push ได้:', e);
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-96.png',
    vibrate: [200, 100, 200],
    data: data.data || {},
    tag: data.tag || 'notification',
    requireInteraction: true,
    actions: data.actions || [
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

// จัดการการคลิกที่ Notification
self.addEventListener('notificationclick', event => {
  console.log('🔔 Notification ถูกคลิก:', event.notification.tag);
  
  event.notification.close();
  
  const action = event.action;
  
  if (action === 'close') {
    // ปิด notification
    console.log('❌ ปิด notification');
  } else {
    // เปิดแอป
    event.waitUntil(
      clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      }).then(clientList => {
        // ตรวจสอบว่ามีหน้าต่างที่เปิดอยู่แล้วหรือไม่
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        
        // ถ้าไม่มีหน้าต่างที่เปิดอยู่ ให้เปิดใหม่
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
});

// Background Sync (ถ้ามีการซิงค์)
self.addEventListener('sync', event => {
  console.log('🔄 Background Sync:', event.tag);
  
  if (event.tag === 'sync-alarms') {
    event.waitUntil(syncAlarms());
  }
});

// ฟังก์ชันซิงค์ Alarms
async function syncAlarms() {
  try {
    // ดึงข้อมูลจาก IndexedDB หรือ localStorage
    console.log('🔄 กำลังซิงค์ alarms...');
    // ในที่นี้ควรเพิ่มโค้ดสำหรับซิงค์กับเซิร์ฟเวอร์
  } catch (error) {
    console.error('❌ ซิงค์ล้มเหลว:', error);
  }
}

// Periodic Background Sync (สำหรับการตรวจสอบเป็นระยะ)
if ('periodicSync' in self.registration) {
  self.registration.periodicSync.register({
    tag: 'check-notifications',
    minInterval: 30 * 60 * 1000 // ทุก 30 นาที
  }).then(() => {
    console.log('✅ Periodic Sync ถูกลงทะเบียนแล้ว');
  }).catch(error => {
    console.log('❌ Periodic Sync ล้มเหลว:', error);
  });
}
