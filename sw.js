// Service Worker สำหรับระบบแจ้งเตือนข้ามเครื่อง
const CACHE_NAME = 'notification-system-v1';
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
        console.log('Cache opened');
        return cache.addAll(urlsToCache);
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
  console.log('Push event received:', event);
  
  let data = {
    title: 'การแจ้งเตือนใหม่',
    body: 'คุณมีการแจ้งเตือนใหม่',
    icon: '/icon-192x192.png',
    badge: '/badge-96x96.png'
  };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      console.log('Error parsing push data:', e);
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon || '/icon-192x192.png',
    badge: data.badge || '/badge-96x96.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      type: data.type || 'notification',
      timestamp: data.timestamp || Date.now(),
      alarm_id: data.alarm_id,
      broadcast_id: data.broadcast_id
    },
    actions: [
      {
        action: 'view',
        title: 'ดู'
      },
      {
        action: 'dismiss',
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
  console.log('Notification clicked:', event.notification.data);
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  // เปิดหน้าเว็บหรือแท็บที่มีอยู่
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(clientList => {
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
});

// Background Sync สำหรับการ Sync ข้อมูล
self.addEventListener('sync', event => {
  if (event.tag === 'sync-alarms') {
    console.log('Background sync: sync-alarms');
    event.waitUntil(syncAlarms());
  }
  
  if (event.tag === 'sync-broadcasts') {
    console.log('Background sync: sync-broadcasts');
    event.waitUntil(syncBroadcasts());
  }
});

// Periodic Sync (ทุก 1 ชั่วโมง)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'periodic-sync') {
    console.log('Periodic sync triggered');
    event.waitUntil(periodicSync());
  }
});

// ฟังก์ชัน Sync ข้อมูล
async function syncAlarms() {
  // ดึงข้อมูล alarms ใหม่จากเซิร์ฟเวอร์
  try {
    const response = await fetch('YOUR_GOOGLE_SCRIPT_URL?action=sync_alarms');
    const data = await response.json();
    
    if (data.status === 'success' && data.alarms.length > 0) {
      // แสดงการแจ้งเตือนสำหรับ alarms ใหม่
      data.alarms.forEach(alarm => {
        self.registration.showNotification(`แจ้งเตือนใหม่: ${alarm.title}`, {
          body: alarm.description || 'มีการแจ้งเตือนใหม่',
          icon: '/icon-192x192.png',
          badge: '/badge-96x96.png',
          tag: `alarm-${alarm.id}`,
          data: {
            type: 'new_alarm',
            alarm_id: alarm.id,
            url: '/'
          }
        });
      });
    }
  } catch (error) {
    console.error('Sync alarms error:', error);
  }
}

async function syncBroadcasts() {
  // ดึงข้อมูล broadcasts ใหม่จากเซิร์ฟเวอร์
  try {
    const response = await fetch('YOUR_GOOGLE_SCRIPT_URL?action=get_broadcasts');
    const data = await response.json();
    
    if (data.status === 'success' && data.data.length > 0) {
      // แสดงการแจ้งเตือนสำหรับ broadcasts ใหม่
      data.data.forEach(broadcast => {
        self.registration.showNotification(`ประกาศ: ${broadcast.title}`, {
          body: broadcast.message,
          icon: '/icon-192x192.png',
          badge: '/badge-96x96.png',
          tag: `broadcast-${broadcast.id}`,
          data: {
            type: 'broadcast',
            broadcast_id: broadcast.id,
            url: '/'
          }
        });
      });
    }
  } catch (error) {
    console.error('Sync broadcasts error:', error);
  }
}

async function periodicSync() {
  // Sync ทั้ง alarms และ broadcasts
  await syncAlarms();
  await syncBroadcasts();
}

// รับข้อมูลจาก client (หน้าต่างหลัก)
self.addEventListener('message', event => {
  console.log('Message from client:', event.data);
  
  if (event.data.type === 'REGISTER_DEVICE') {
    // บันทึกข้อมูล device
    registerDevice(event.data.payload);
  }
});

async function registerDevice(payload) {
  try {
    const response = await fetch('YOUR_GOOGLE_SCRIPT_URL?action=register_device', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    console.log('Device registered:', await response.json());
  } catch (error) {
    console.error('Device registration error:', error);
  }
}
