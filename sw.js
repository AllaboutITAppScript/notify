// sw.js - Service Worker สำหรับทำงานในพื้นหลัง
const CACHE_NAME = 'notification-app-v4.0';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json'
];

// ติดตั้ง Service Worker
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
      .catch(error => {
        console.error('[Service Worker] ติดตั้งล้มเหลว:', error);
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
    .catch(error => {
      console.error('[Service Worker] เปิดใช้งานล้มเหลว:', error);
    })
  );
});

// จัดการการดึงข้อมูล
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
          .catch(error => {
            console.log('[Service Worker] ดึงข้อมูลล้มเหลว:', error);
            // สามารถแสดงหน้า offline ได้ที่นี่
          });
      })
  );
});

// จัดการ Background Sync
self.addEventListener('sync', event => {
  console.log('[Service Worker] Background Sync:', event.tag);
  
  if (event.tag === 'sync-notifications') {
    event.waitUntil(
      syncNotifications()
    );
  }
  
  if (event.tag === 'check-scheduled') {
    event.waitUntil(
      checkScheduledNotifications()
    );
  }
});

// รับข้อความจากหน้าเว็บ
self.addEventListener('message', event => {
  console.log('[Service Worker] ได้รับข้อความ:', event.data);
  
  const { type, data, notification } = event.data;
  
  switch (type) {
    case 'SCHEDULE_NOTIFICATION':
      console.log('[Service Worker] ตั้งเวลาแจ้งเตือน:', notification);
      handleScheduledNotification(notification);
      break;
      
    case 'APP_READY':
      console.log('[Service Worker] แอปพร้อมใช้งาน:', data);
      // เริ่มการตรวจสอบในพื้นหลัง
      startBackgroundChecks();
      break;
      
    case 'SEND_TEST':
      console.log('[Service Worker] ส่งทดสอบ');
      self.registration.showNotification('ทดสอบจาก Service Worker', {
        body: 'นี่คือการทดสอบจากพื้นหลัง',
        icon: '/icons/icon-192x192.png',
        tag: 'test-' + Date.now(),
        requireInteraction: true
      });
      break;
      
    default:
      console.log('[Service Worker] ประเภทข้อความไม่รู้จัก:', type);
  }
});

// จัดการการแจ้งเตือนที่ตั้งเวลาไว้
function handleScheduledNotification(notification) {
  console.log('[Service Worker] จัดการแจ้งเตือนที่ตั้งเวลาไว้:', notification.id);
  
  // บันทึกลง IndexedDB
  saveToIndexedDB('scheduled_notifications', notification)
    .then(() => {
      console.log('[Service Worker] บันทึกแจ้งเตือนสำเร็จ');
      
      // ลงทะเบียน Background Sync สำหรับตรวจสอบ
      if ('SyncManager' in self.registration) {
        self.registration.sync.register('check-scheduled')
          .then(() => {
            console.log('[Service Worker] ลงทะเบียน Background Sync สำหรับตรวจสอบ');
          })
          .catch(error => {
            console.error('[Service Worker] ลงทะเบียน Sync ล้มเหลว:', error);
          });
      }
    })
    .catch(error => {
      console.error('[Service Worker] บันทึกลง DB ล้มเหลว:', error);
    });
}

// เริ่มการตรวจสอบในพื้นหลัง
function startBackgroundChecks() {
  console.log('[Service Worker] เริ่มการตรวจสอบในพื้นหลัง');
  
  // ตรวจสอบทุก 5 นาที
  setInterval(() => {
    checkScheduledNotifications().then(count => {
      if (count > 0) {
        console.log(`[Service Worker] ส่ง ${count} การแจ้งเตือนจากพื้นหลัง`);
      }
    });
  }, 5 * 60 * 1000);
  
  // ตรวจสอบทันที
  setTimeout(() => {
    checkScheduledNotifications();
  }, 10000);
}

// ตรวจสอบการแจ้งเตือนที่ตั้งเวลาไว้
async function checkScheduledNotifications() {
  try {
    // ดึงการแจ้งเตือนที่ตั้งเวลาไว้จาก IndexedDB
    const scheduled = await getScheduledNotifications();
    const now = Date.now();
    
    // กรองการแจ้งเตือนที่ถึงเวลาแล้ว
    const dueNotifications = scheduled.filter(notification => 
      notification.scheduledTime <= now
    );
    
    console.log(`[Service Worker] พบ ${dueNotifications.length} การแจ้งเตือนที่ถึงเวลา`);
    
    // ส่งการแจ้งเตือนที่ถึงเวลาแล้ว
    for (const notification of dueNotifications) {
      await sendNotification(notification);
      
      // ลบออกจากฐานข้อมูล
      await deleteNotification(notification.id);
    }
    
    return dueNotifications.length;
    
  } catch (error) {
    console.error('[Service Worker] ตรวจสอบการแจ้งเตือนล้มเหลว:', error);
    return 0;
  }
}

// ส่งการแจ้งเตือน
async function sendNotification(notification) {
  console.log('[Service Worker] ส่งการแจ้งเตือน:', notification.title);
  
  const options = {
    body: `[จากพื้นหลัง] ${notification.message}`,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: notification.id,
    timestamp: notification.scheduledTime,
    requireInteraction: true,
    data: {
      id: notification.id,
      type: 'scheduled',
      fromBackground: true
    },
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
    vibrate: [200, 100, 200, 100, 200]
  };
  
  await self.registration.showNotification(notification.title, options);
  
  // ส่งข้อความไปยังหน้าเว็บ (ถ้าเปิดอยู่)
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'NOTIFICATION_SENT_FROM_BACKGROUND',
      notification: notification
    });
  });
  
  console.log('[Service Worker] ส่งการแจ้งเตือนสำเร็จ');
}

// ซิงค์การแจ้งเตือน
async function syncNotifications() {
  console.log('[Service Worker] กำลังซิงค์การแจ้งเตือน...');
  
  try {
    // ในแอปจริง คุณอาจซิงค์กับเซิร์ฟเวอร์ที่นี่
    // สำหรับตัวอย่างนี้ เราจะตรวจสอบการแจ้งเตือนที่ตั้งเวลาไว้
    
    const count = await checkScheduledNotifications();
    
    console.log(`[Service Worker] ซิงค์สำเร็จ: ${count} การแจ้งเตือน`);
    
    return count;
    
  } catch (error) {
    console.error('[Service Worker] ซิงค์ล้มเหลว:', error);
    throw error;
  }
}

// ========== IndexedDB Helper Functions ==========

// บันทึกลง IndexedDB
function saveToIndexedDB(storeName, data) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NotificationBackgroundDB', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      // สร้าง object store ถ้ายังไม่มี
      if (!db.objectStoreNames.contains(storeName)) {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
      }
      
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const addRequest = store.add(data);
      
      addRequest.onsuccess = () => resolve();
      addRequest.onerror = () => reject(addRequest.error);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // สร้าง object stores
      if (!db.objectStoreNames.contains('scheduled_notifications')) {
        const store = db.createObjectStore('scheduled_notifications', { keyPath: 'id' });
        store.createIndex('scheduledTime', 'scheduledTime');
        store.createIndex('status', 'status');
      }
    };
  });
}

// ดึงการแจ้งเตือนที่ตั้งเวลาไว้
function getScheduledNotifications() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NotificationBackgroundDB', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('scheduled_notifications')) {
        resolve([]);
        return;
      }
      
      const transaction = db.transaction(['scheduled_notifications'], 'readonly');
      const store = transaction.objectStore('scheduled_notifications');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => resolve(getAllRequest.result || []);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
  });
}

// ลบการแจ้งเตือน
function deleteNotification(id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NotificationBackgroundDB', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('scheduled_notifications')) {
        resolve();
        return;
      }
      
      const transaction = db.transaction(['scheduled_notifications'], 'readwrite');
      const store = transaction.objectStore('scheduled_notifications');
      const deleteRequest = store.delete(id);
      
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };
  });
}

// ส่งข้อความไปยังหน้าเว็บทั้งหมด
function sendMessageToAllClients(message) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage(message);
    });
  });
}

// Periodic background task - ตรวจสอบทุก 1 นาที
setInterval(() => {
  console.log('[Service Worker] ตรวจสอบพื้นหลัง...');
  checkScheduledNotifications().then(count => {
    if (count > 0) {
      console.log(`[Service Worker] ส่ง ${count} การแจ้งเตือนจากพื้นหลัง`);
    }
  });
}, 60 * 1000);
