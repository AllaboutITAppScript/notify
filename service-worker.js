// service-worker.js
const CACHE_NAME = 'notification-app-v2.0';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// ติดตั้ง Service Worker
self.addEventListener('install', event => {
  console.log('[Service Worker] กำลังติดตั้ง...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] กำลังแคชไฟล์แอป');
        return cache.addAll(APP_SHELL);
      })
      .then(() => {
        console.log('[Service Worker] ติดตั้งสำเร็จ');
        return self.skipWaiting();
      })
  );
});

// เปิดใช้งาน Service Worker
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

// ดักจับการเรียกข้อมูล
self.addEventListener('fetch', event => {
  // ข้ามคำขอที่ไม่ใช่ GET
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // ถ้ามีในแคชให้ส่งกลับ
        if (response) {
          return response;
        }
        
        // ถ้าไม่มีให้เรียกจากเน็ตเวิร์ก
        return fetch(event.request)
          .then(response => {
            // ตรวจสอบว่าควรแคชหรือไม่
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // โคลน response เพื่อแคช
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          })
          .catch(() => {
            // ถ้าไม่สามารถเชื่อมต่อได้ อาจแสดงหน้า offline
            console.log('[Service Worker] ไม่สามารถโหลดได้:', event.request.url);
          });
      })
  );
});

// จัดการ Push Notifications
self.addEventListener('push', event => {
  console.log('[Service Worker] ได้รับ Push Notification');
  
  let data = {
    title: 'การแจ้งเตือนใหม่',
    body: 'คุณมีการแจ้งเตือนใหม่จากเว็บแอป',
    icon: 'icons/icon-192x192.png',
    badge: 'icons/icon-96x96.png',
    tag: 'push-notification',
    timestamp: Date.now(),
    requireInteraction: true
  };
  
  // พยายามอ่านข้อมูลจาก Push
  if (event.data) {
    try {
      const pushData = event.data.json();
      data = { ...data, ...pushData };
    } catch (e) {
      console.log('[Service Worker] ข้อมูล Push ไม่ใช่ JSON, ใช้ข้อความธรรมดา');
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
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// จัดการเมื่อคลิกที่ Notification
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] คลิกที่ Notification:', event.notification.tag);
  
  event.notification.close();
  
  // ตรวจสอบว่าเป็นการคลิกปุ่ม action หรือไม่
  if (event.action === 'open') {
    // เปิดหรือโฟกัสที่แอป
    event.waitUntil(
      clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      })
      .then(clientList => {
        // หาแอปที่เปิดอยู่แล้ว
        for (const client of clientList) {
          if (client.url.includes(self.registration.scope) && 'focus' in client) {
            return client.focus();
          }
        }
        
        // ถ้าไม่มีแอปที่เปิดอยู่ ให้เปิดใหม่
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  } else if (event.action === 'dismiss') {
    // ไม่ทำอะไร เพียงปิดการแจ้งเตือน
    console.log('[Service Worker] ปิดการแจ้งเตือน');
  } else {
    // คลิกที่ตัวการแจ้งเตือนเอง (ไม่ใช่ปุ่ม action)
    event.waitUntil(
      clients.matchAll({
        type: 'window',
        includeUncontrolled: true
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
});

// จัดการ Background Sync
self.addEventListener('sync', event => {
  console.log('[Service Worker] Background Sync:', event.tag);
  
  if (event.tag === 'sync-notifications') {
    event.waitUntil(
      syncNotifications()
    );
  }
});

// ฟังก์ชันซิงค์การแจ้งเตือน
async function syncNotifications() {
  console.log('[Service Worker] กำลังซิงค์การแจ้งเตือน...');
  
  try {
    // ในแอปจริง คุณอาจดึงข้อมูลจากเซิร์ฟเวอร์ที่นี่
    // สำหรับตัวอย่างนี้ เราจะแค่ตรวจสอบการแจ้งเตือนที่ตั้งเวลาไว้
    
    // ส่งการแจ้งเตือนว่ากำลังซิงค์
    await self.registration.showNotification('กำลังซิงค์ข้อมูล', {
      body: 'ระบบกำลังซิงค์ข้อมูลการแจ้งเตือน',
      icon: 'icons/icon-192x192.png',
      tag: 'sync-' + Date.now()
    });
    
    return true;
  } catch (error) {
    console.error('[Service Worker] ซิงค์ล้มเหลว:', error);
    return false;
  }
}

// รับข้อความจากหน้าเว็บ
self.addEventListener('message', event => {
  console.log('[Service Worker] ได้รับข้อความ:', event.data);
  
  const { type, data, notification } = event.data;
  
  switch (type) {
    case 'SCHEDULE_NOTIFICATION':
      console.log('[Service Worker] ได้รับการตั้งเวลา:', notification);
      handleScheduledNotification(notification);
      break;
      
    case 'PUSH_FROM_SERVER':
      console.log('[Service Worker] ได้รับ Push จากเซิร์ฟเวอร์:', notification);
      showServerNotification(notification);
      break;
      
    case 'TEST_NOTIFICATION':
      console.log('[Service Worker] ทดสอบการแจ้งเตือน');
      self.registration.showNotification('ทดสอบจาก Service Worker', {
        body: 'นี่คือการทดสอบการแจ้งเตือน',
        icon: 'icons/icon-192x192.png',
        tag: 'test-' + Date.now()
      });
      break;
      
    default:
      console.log('[Service Worker] ประเภทข้อความไม่รู้จัก:', type);
  }
});

// จัดการการแจ้งเตือนที่ตั้งเวลาไว้
function handleScheduledNotification(notification) {
  console.log('[Service Worker] จัดการการแจ้งเตือนที่ตั้งเวลาไว้:', notification.id);
  
  // บันทึกลง IndexedDB สำหรับการเข้าถึงในพื้นหลัง
  saveToIndexedDB(notification)
    .then(() => {
      console.log('[Service Worker] บันทึกการแจ้งเตือนสำเร็จ');
      
      // พยายามตั้งค่า Periodic Sync สำหรับการตรวจสอบ
      setupPeriodicSync();
    })
    .catch(error => {
      console.error('[Service Worker] บันทึกการแจ้งเตือนล้มเหลว:', error);
    });
}

// แสดงการแจ้งเตือนจากเซิร์ฟเวอร์
function showServerNotification(notification) {
  console.log('[Service Worker] แสดงการแจ้งเตือนจากเซิร์ฟเวอร์:', notification.title);
  
  self.registration.showNotification(notification.title, {
    body: `[จากเซิร์ฟเวอร์] ${notification.message}`,
    icon: 'icons/icon-192x192.png',
    badge: 'icons/icon-96x96.png',
    tag: notification.id,
    timestamp: notification.scheduledTime || Date.now(),
    requireInteraction: true,
    data: {
      id: notification.id,
      fromServer: true
    },
    actions: [
      {
        action: 'open',
        title: 'เปิดแอป'
      }
    ],
    vibrate: [200, 100, 200]
  });
}

// บันทึกลง IndexedDB
async function saveToIndexedDB(notification) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NotificationDB', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('notifications')) {
        const transaction = db.transaction(['notifications'], 'readwrite');
        const store = transaction.objectStore('notifications');
        
        // สร้าง index
        if (!store.indexNames.contains('scheduledTime')) {
          store.createIndex('scheduledTime', 'scheduledTime');
        }
      }
      
      const transaction = db.transaction(['notifications'], 'readwrite');
      const store = transaction.objectStore('notifications');
      const addRequest = store.add(notification);
      
      addRequest.onsuccess = () => resolve();
      addRequest.onerror = () => reject(addRequest.error);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('notifications')) {
        const store = db.createObjectStore('notifications', { keyPath: 'id' });
        store.createIndex('scheduledTime', 'scheduledTime');
        store.createIndex('status', 'status');
      }
    };
  });
}

// ตั้งค่า Periodic Sync
function setupPeriodicSync() {
  if ('periodicSync' in self.registration) {
    self.registration.periodicSync.register('check-notifications', {
      minInterval: 24 * 60 * 60 * 1000 // 1 วัน (ขั้นต่ำ)
    }).then(() => {
      console.log('[Service Worker] ตั้งค่า Periodic Sync สำเร็จ');
    }).catch(error => {
      console.error('[Service Worker] ตั้งค่า Periodic Sync ล้มเหลว:', error);
    });
  }
}

// ตรวจสอบการแจ้งเตือนเป็นระยะ (สำหรับเบราว์เซอร์ที่ไม่รองรับ Periodic Sync)
setInterval(() => {
  checkScheduledNotifications().then(count => {
    if (count > 0) {
      console.log(`[Service Worker] ส่ง ${count} การแจ้งเตือนจากพื้นหลัง`);
    }
  });
}, 60 * 1000); // ทุก 1 นาที

// ตรวจสอบการแจ้งเตือนที่ถึงเวลา
async function checkScheduledNotifications() {
  try {
    const notifications = await getScheduledNotificationsFromDB();
    const now = Date.now();
    
    const dueNotifications = notifications.filter(notification => 
      notification.status === 'scheduled' && 
      notification.scheduledTime <= now
    );
    
    console.log(`[Service Worker] พบ ${dueNotifications.length} การแจ้งเตือนที่ถึงเวลา`);
    
    for (const notification of dueNotifications) {
      await self.registration.showNotification(notification.title, {
        body: notification.message,
        icon: 'icons/icon-192x192.png',
        tag: notification.id,
        timestamp: notification.scheduledTime,
        requireInteraction: true
      });
      
      // อัพเดทสถานะ
      notification.status = 'sent';
      await updateNotificationInDB(notification);
      
      console.log(`[Service Worker] ส่งการแจ้งเตือน: ${notification.title}`);
    }
    
    return dueNotifications.length;
    
  } catch (error) {
    console.error('[Service Worker] ตรวจสอบการแจ้งเตือนล้มเหลว:', error);
    return 0;
  }
}

// ดึงการแจ้งเตือนที่ตั้งเวลาไว้จาก DB
async function getScheduledNotificationsFromDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NotificationDB', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('notifications')) {
        resolve([]);
        return;
      }
      
      const transaction = db.transaction(['notifications'], 'readonly');
      const store = transaction.objectStore('notifications');
      const index = store.index('status');
      
      const getRequest = index.getAll('scheduled');
      
      getRequest.onsuccess = () => resolve(getRequest.result || []);
      getRequest.onerror = () => reject(getRequest.error);
    };
  });
}

// อัพเดทการแจ้งเตือนใน DB
async function updateNotificationInDB(notification) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NotificationDB', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      const transaction = db.transaction(['notifications'], 'readwrite');
      const store = transaction.objectStore('notifications');
      const putRequest = store.put(notification);
      
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
  });
}

// Background Fetch (ถ้ารองรับ)
if ('backgroundFetch' in self.registration) {
  self.addEventListener('backgroundfetchsuccess', event => {
    console.log('[Service Worker] Background Fetch สำเร็จ:', event.registration.id);
  });
  
  self.addEventListener('backgroundfetchfail', event => {
    console.log('[Service Worker] Background Fetch ล้มเหลว:', event.registration.id);
  });
}
