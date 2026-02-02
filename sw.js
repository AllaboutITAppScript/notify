// sw.js - Service Worker ที่ใช้งานได้จริง
const CACHE_NAME = 'notification-app-' + Date.now();
const APP_FILES = [
  '/',
  '/index.html',
  '/background.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install
self.addEventListener('install', event => {
  console.log('🔧 Service Worker กำลังติดตั้ง...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 แคชไฟล์แอป');
        return cache.addAll(APP_FILES);
      })
      .then(() => {
        console.log('✅ ติดตั้งสำเร็จ');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('❌ ติดตั้งล้มเหลว:', error);
      })
  );
});

// Activate
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker กำลังเปิดใช้งาน...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ ลบแคชเก่า:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('✅ เปิดใช้งานสำเร็จ');
      return self.clients.claim();
    })
    .catch(error => {
      console.error('❌ เปิดใช้งานล้มเหลว:', error);
    })
  );
});

// Background Sync
self.addEventListener('sync', event => {
  console.log('🔄 Background Sync:', event.tag);
  
  if (event.tag === 'check-notifications') {
    event.waitUntil(checkScheduledNotifications());
  }
});

// Message from page
self.addEventListener('message', event => {
  console.log('📩 ได้รับข้อความจากหน้า:', event.data);
  
  const { type, data, notification } = event.data;
  
  switch (type) {
    case 'SCHEDULE_NOTIFICATION':
      console.log('⏰ ตั้งเวลาแจ้งเตือน:', notification);
      handleScheduledNotification(notification);
      break;
      
    case 'SEND_NOTIFICATION':
      console.log('🔔 ส่งแจ้งเตือนทันที:', data);
      self.registration.showNotification(data.title, {
        body: data.message,
        icon: 'https://img.icons8.com/color/96/000000/appointment-reminders.png',
        tag: data.id,
        requireInteraction: true
      });
      break;
      
    default:
      console.log('❓ ประเภทไม่รู้จัก:', type);
  }
});

// Handle scheduled notification
function handleScheduledNotification(notification) {
  console.log('⏰ จัดการแจ้งเตือนที่ตั้งเวลา:', notification.id);
  
  // Calculate delay
  const delay = notification.scheduledTime - Date.now();
  
  if (delay > 0) {
    console.log(`⏳ จะแจ้งเตือนในอีก ${Math.round(delay/1000)} วินาที`);
    
    // Set timeout for notification
    setTimeout(() => {
      sendScheduledNotification(notification);
    }, delay);
    
    // Also save to IndexedDB for background
    saveToIndexedDB(notification);
  } else {
    // Send immediately if time has passed
    sendScheduledNotification(notification);
  }
}

// Send scheduled notification
function sendScheduledNotification(notification) {
  console.log('🔔 ส่งแจ้งเตือนที่ตั้งเวลา:', notification.title);
  
  const options = {
    body: `[ตามเวลา] ${notification.message}`,
    icon: 'https://img.icons8.com/color/96/000000/appointment-reminders.png',
    badge: 'https://img.icons8.com/color/96/000000/appointment-reminders.png',
    tag: notification.id,
    timestamp: notification.scheduledTime,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: {
      id: notification.id,
      type: 'scheduled',
      originalTime: notification.scheduledTime
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
    ]
  };
  
  self.registration.showNotification(notification.title, options)
    .then(() => {
      console.log('✅ ส่งแจ้งเตือนสำเร็จ');
      
      // Send message to all clients
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'NOTIFICATION_SENT',
            notification: notification
          });
        });
      });
    })
    .catch(error => {
      console.error('❌ ส่งแจ้งเตือนล้มเหลว:', error);
    });
}

// Check scheduled notifications
async function checkScheduledNotifications() {
  console.log('🔍 ตรวจสอบแจ้งเตือนที่ตั้งเวลาไว้...');
  
  try {
    const notifications = await getScheduledNotifications();
    const now = Date.now();
    
    const dueNotifications = notifications.filter(n => n.scheduledTime <= now);
    
    console.log(`📊 พบ ${dueNotifications.length} แจ้งเตือนที่ถึงเวลา`);
    
    for (const notification of dueNotifications) {
      await sendScheduledNotification(notification);
      await deleteNotification(notification.id);
    }
    
    return dueNotifications.length;
  } catch (error) {
    console.error('❌ ตรวจสอบล้มเหลว:', error);
    return 0;
  }
}

// Save to IndexedDB
function saveToIndexedDB(notification) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NotificationDB', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('notifications')) {
        const transaction = db.transaction(['notifications'], 'readwrite');
        const store = transaction.objectStore('notifications');
      }
      
      const transaction = db.transaction(['notifications'], 'readwrite');
      const store = transaction.objectStore('notifications');
      const addRequest = store.put(notification);
      
      addRequest.onsuccess = () => resolve();
      addRequest.onerror = () => reject(addRequest.error);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('notifications')) {
        const store = db.createObjectStore('notifications', { keyPath: 'id' });
        store.createIndex('scheduledTime', 'scheduledTime');
      }
    };
  });
}

// Get scheduled notifications
function getScheduledNotifications() {
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
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => resolve(getAllRequest.result || []);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
  });
}

// Delete notification
function deleteNotification(id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NotificationDB', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      const transaction = db.transaction(['notifications'], 'readwrite');
      const store = transaction.objectStore('notifications');
      const deleteRequest = store.delete(id);
      
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };
  });
}

// Periodic check every 1 minute
setInterval(() => {
  console.log('⏰ ตรวจสอบแจ้งเตือนประจำนาที...');
  checkScheduledNotifications().then(count => {
    if (count > 0) {
      console.log(`✅ ส่ง ${count} แจ้งเตือนจากพื้นหลัง`);
    }
  });
}, 60000);

// Initial check after 30 seconds
setTimeout(() => {
  checkScheduledNotifications();
}, 30000);
