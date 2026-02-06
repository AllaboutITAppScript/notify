// sw.js - Service Worker สำหรับการแจ้งเตือนเบื้องหลัง
const CACHE_NAME = 'notification-system-v1';
const OFFLINE_URL = '/offline.html';

// รายการไฟล์ที่จะเก็บใน Cache
const CACHE_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/sounds/notification.mp3'
];

// ติดตั้ง Service Worker
self.addEventListener('install', (event) => {
  console.log('🟢 Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('🟢 Service Worker: Caching app shell');
        return cache.addAll(CACHE_FILES);
      })
      .then(() => {
        console.log('🟢 Service Worker: Skip waiting');
        return self.skipWaiting();
      })
  );
});

// เปิดใช้งาน Service Worker
self.addEventListener('activate', (event) => {
  console.log('🟢 Service Worker: Activated');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🟢 Service Worker: Clearing old cache');
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('🟢 Service Worker: Claiming clients');
      return self.clients.claim();
    })
  );
});

// ดักจับการ fetch
self.addEventListener('fetch', (event) => {
  // ไม่ต้องทำอะไรพิเศษสำหรับ fetch
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      })
      .catch(() => {
        return caches.match(OFFLINE_URL);
      })
  );
});

// ============================================
// ส่วนจัดการการแจ้งเตือนเบื้องหลัง
// ============================================

// ดักจับการ push notification
self.addEventListener('push', (event) => {
  console.log('📨 Service Worker: Push received', event.data.text());
  
  let data = {};
  try {
    data = event.data ? JSON.parse(event.data.text()) : {};
  } catch (e) {
    data = { title: 'การแจ้งเตือน', body: 'คุณมีข้อความใหม่' };
  }
  
  const options = {
    body: data.body || 'การแจ้งเตือนจากระบบ',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    vibrate: [200, 100, 200, 100, 200],
    data: {
      url: data.url || '/',
      type: data.type || 'general',
      alarmId: data.alarmId,
      timestamp: data.timestamp || Date.now()
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
  
  // สำหรับการแจ้งเตือนด่วน
  if (data.urgent) {
    options.requireInteraction = true;
    options.vibrate = [1000, 500, 1000, 500, 1000];
    options.tag = 'urgent';
  }
  
  event.waitUntil(
    self.registration.showNotification(
      data.title || 'ระบบแจ้งเตือน',
      options
    )
  );
});

// ดักจับการคลิกที่ notification
self.addEventListener('notificationclick', (event) => {
  console.log('🔘 Service Worker: Notification clicked');
  
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }
  
  event.waitUntil(
    clients.matchAll({ 
      type: 'window', 
      includeUncontrolled: true 
    })
    .then((clientList) => {
      // เปิดหน้าต่างที่มีอยู่หรือเปิดใหม่
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url || '/');
      }
    })
  );
});

// ============================================
// ส่วนจัดการ Background Sync
// ============================================

// Background Sync สำหรับการ sync ข้อมูล
self.addEventListener('sync', (event) => {
  console.log('🔄 Service Worker: Background sync', event.tag);
  
  if (event.tag === 'sync-alarms') {
    event.waitUntil(syncAlarms());
  } else if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotifications());
  }
});

// ฟังก์ชัน sync alarms
async function syncAlarms() {
  try {
    // ดึงข้อมูล alarms จาก IndexedDB หรือ cache
    const alarms = await getAlarmsFromDB();
    
    // ส่งไปยังเซิร์ฟเวอร์ (ในที่นี้เราใช้ localStorage แบบง่ายๆ)
    console.log('🔄 Syncing alarms:', alarms.length);
    
    // ตัวอย่าง: ส่งข้อมูลไปยังเซิร์ฟเวอร์จริง
    // const response = await fetch('https://your-api.com/sync', {
    //   method: 'POST',
    //   body: JSON.stringify({ alarms })
    // });
    
    return Promise.resolve();
  } catch (error) {
    console.error('❌ Sync alarms failed:', error);
    return Promise.reject(error);
  }
}

// ฟังก์ชัน sync notifications
async function syncNotifications() {
  console.log('🔄 Syncing notifications');
  return Promise.resolve();
}

// ดึงข้อมูล alarms จาก IndexedDB
async function getAlarmsFromDB() {
  return new Promise((resolve) => {
    const request = indexedDB.open('NotificationDB', 1);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['alarms'], 'readonly');
      const store = transaction.objectStore('alarms');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        resolve(getAllRequest.result || []);
      };
      
      getAllRequest.onerror = () => {
        resolve([]);
      };
    };
    
    request.onerror = () => {
      resolve([]);
    };
  });
}

// ============================================
// ส่วนจัดการ Periodic Sync (สำหรับ Chrome)
// ============================================

// Periodic Sync - อัปเดตข้อมูลเป็นระยะ
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-feeds') {
    console.log('⏰ Periodic sync triggered');
    event.waitUntil(updateFeeds());
  }
});

async function updateFeeds() {
  console.log('⏰ Updating feeds in background');
  // ดึงข้อมูลใหม่จากเซิร์ฟเวอร์
  return Promise.resolve();
}

// ============================================
// ฟังก์ชันตรวจสอบ alarms ในเบื้องหลัง
// ============================================

// ตรวจสอบ alarms ทุก 60 วินาที
setInterval(() => {
  checkBackgroundAlarms();
}, 60000);

async function checkBackgroundAlarms() {
  console.log('⏰ Background: Checking alarms');
  
  const alarms = await getAlarmsFromDB();
  const now = new Date();
  
  alarms.forEach(alarm => {
    if (!alarm.triggered && new Date(alarm.datetime) <= now) {
      triggerBackgroundAlarm(alarm);
    }
  });
}

function triggerBackgroundAlarm(alarm) {
  console.log('🔔 Background: Triggering alarm', alarm.title);
  
  // สร้าง notification
  self.registration.showNotification('⏰ ' + alarm.title, {
    body: alarm.description || 'เวลาแจ้งเตือนถึงแล้ว',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    vibrate: [500, 200, 500],
    requireInteraction: true,
    data: {
      url: '/',
      type: 'alarm',
      alarmId: alarm.id,
      timestamp: Date.now()
    }
  });
  
  // อัปเดตสถานะ alarm
  updateAlarmStatus(alarm.id);
}

async function updateAlarmStatus(alarmId) {
  // อัปเดตใน IndexedDB
  return new Promise((resolve) => {
    const request = indexedDB.open('NotificationDB', 1);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['alarms'], 'readwrite');
      const store = transaction.objectStore('alarms');
      
      const getRequest = store.get(alarmId);
      getRequest.onsuccess = () => {
        const alarm = getRequest.result;
        if (alarm) {
          alarm.triggered = true;
          alarm.triggered_at = new Date().toISOString();
          store.put(alarm);
        }
        resolve();
      };
    };
  });
}

// ============================================
// เริ่มต้น IndexedDB
// ============================================

function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NotificationDB', 1);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // สร้าง object store สำหรับ alarms
      if (!db.objectStoreNames.contains('alarms')) {
        const alarmStore = db.createObjectStore('alarms', { keyPath: 'id' });
        alarmStore.createIndex('datetime', 'datetime', { unique: false });
        alarmStore.createIndex('triggered', 'triggered', { unique: false });
      }
      
      // สร้าง object store สำหรับ notifications
      if (!db.objectStoreNames.contains('notifications')) {
        const notificationStore = db.createObjectStore('notifications', { keyPath: 'id' });
        notificationStore.createIndex('time', 'time', { unique: false });
      }
    };
    
    request.onsuccess = (event) => {
      console.log('✅ IndexedDB initialized');
      resolve(event.target.result);
    };
    
    request.onerror = (event) => {
      console.error('❌ IndexedDB failed:', event.target.error);
      reject(event.target.error);
    };
  });
}

// เริ่มต้น IndexedDB เมื่อ Service Worker ถูกเปิดใช้งาน
initIndexedDB();
