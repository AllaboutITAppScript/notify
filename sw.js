// sw.js - Service Worker สำหรับแจ้งเตือนแม้ปิดแอปและล็อคหน้าจอ
const CACHE_NAME = 'notification-system-v2';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// IndexedDB สำหรับเก็บ alarms
const DB_NAME = 'AlarmDB';
const DB_VERSION = 1;

// ติดตั้ง Service Worker
self.addEventListener('install', (event) => {
  console.log('🟢 Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('🟢 Caching app shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => {
        console.log('🟢 Service Worker installed');
        return self.skipWaiting();
      })
  );
});

// เปิดใช้งาน Service Worker
self.addEventListener('activate', (event) => {
  console.log('🟢 Service Worker: Activated');
  
  event.waitUntil(
    Promise.all([
      // ล้าง cache เก่า
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('🟢 Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // ควบคุม clients ทันที
      self.clients.claim(),
      // เริ่มต้น IndexedDB
      initIndexedDB(),
      // เริ่มตรวจสอบ alarms
      startAlarmChecker()
    ])
  );
});

// เริ่มต้น IndexedDB
function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = function(event) {
      const db = event.target.result;
      
      // สร้าง object store สำหรับ alarms
      if (!db.objectStoreNames.contains('alarms')) {
        const store = db.createObjectStore('alarms', { keyPath: 'id' });
        store.createIndex('datetime', 'datetime', { unique: false });
        store.createIndex('triggered', 'triggered', { unique: false });
      }
      
      // สร้าง object store สำหรับ notifications
      if (!db.objectStoreNames.contains('notifications')) {
        db.createObjectStore('notifications', { keyPath: 'id' });
      }
    };
    
    request.onsuccess = function(event) {
      console.log('✅ IndexedDB initialized');
      resolve(event.target.result);
    };
    
    request.onerror = function(event) {
      console.error('❌ IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
  });
}

// เริ่มตรวจสอบ alarms
function startAlarmChecker() {
  console.log('⏰ Starting alarm checker');
  
  // ตรวจสอบทุก 30 วินาที
  setInterval(() => {
    checkScheduledAlarms();
  }, 30000);
  
  // ตรวจสอบทันทีที่เปิด
  checkScheduledAlarms();
}

// ตรวจสอบ alarms ที่ต้องแจ้งเตือน
async function checkScheduledAlarms() {
  console.log('⏰ Checking scheduled alarms...');
  
  try {
    const db = await getDB();
    if (!db) return;
    
    const transaction = db.transaction(['alarms'], 'readonly');
    const store = transaction.objectStore('alarms');
    const index = store.index('datetime');
    
    // ดึง alarms ที่ยังไม่แจ้งเตือนและถึงเวลาแล้ว
    const range = IDBKeyRange.upperBound(new Date().toISOString());
    const request = index.openCursor(range);
    
    request.onsuccess = function(event) {
      const cursor = event.target.result;
      if (cursor) {
        const alarm = cursor.value;
        
        if (!alarm.triggered) {
          console.log('🔔 Alarm triggered:', alarm.title);
          
          // แจ้งเตือน
          triggerAlarm(alarm);
          
          // อัปเดตสถานะ
          alarm.triggered = true;
          alarm.triggeredAt = new Date().toISOString();
          
          // บันทึกลง IndexedDB
          updateAlarm(alarm);
        }
        cursor.continue();
      }
    };
  } catch (error) {
    console.error('❌ Error checking alarms:', error);
  }
}

// เปิด IndexedDB
function getDB() {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onsuccess = function(event) {
      resolve(event.target.result);
    };
    
    request.onerror = function() {
      resolve(null);
    };
  });
}

// อัปเดต alarm ใน IndexedDB
function updateAlarm(alarm) {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  
  request.onsuccess = function(event) {
    const db = event.target.result;
    const transaction = db.transaction(['alarms'], 'readwrite');
    const store = transaction.objectStore('alarms');
    store.put(alarm);
  };
}

// แจ้งเตือนเมื่อถึงเวลา
function triggerAlarm(alarm) {
  console.log('🔔 Showing notification for:', alarm.title);
  
  const options = {
    body: alarm.description || 'เวลาแจ้งเตือนถึงแล้ว!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: `alarm_${alarm.id}`,
    requireInteraction: true,
    silent: false, // ให้เล่นเสียง
    vibrate: [500, 200, 500, 200, 500], // สั่นแบบยาว
    data: {
      type: 'alarm',
      alarmId: alarm.id,
      url: '/',
      timestamp: Date.now()
    },
    actions: [
      {
        action: 'open',
        title: 'เปิดแอป'
      },
      {
        action: 'snooze',
        title: 'เลื่อน'
      },
      {
        action: 'dismiss',
        title: 'ปิด'
      }
    ]
  };
  
  // สำหรับ iOS ให้เพิ่ม sound
  if ('sound' in Notification.prototype) {
    options.sound = '/sounds/notification.mp3';
  }
  
  self.registration.showNotification(`⏰ ${alarm.title}`, options);
  
  // ส่งข้อความไปยังแอปถ้าเปิดอยู่
  sendMessageToClients({
    type: 'ALARM_TRIGGERED',
    alarm: alarm
  });
  
  // แจ้งเตือนซ้ำอีกครั้งใน 2 นาทีถ้าไม่ตอบสนอง
  setTimeout(() => {
    if (document.visibilityState !== 'visible') {
      self.registration.showNotification(`⏰ ${alarm.title} (แจ้งเตือนอีกครั้ง)`, {
        body: 'ยังไม่ได้เปิดดูการแจ้งเตือนนี้',
        icon: '/icons/icon-192x192.png',
        requireInteraction: true,
        vibrate: [1000, 500, 1000]
      });
    }
  }, 120000); // 2 นาที
}

// ส่งข้อความไปยัง clients
function sendMessageToClients(message) {
  self.clients.matchAll({
    includeUncontrolled: true,
    type: 'window'
  }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage(message);
    });
  });
}

// ============================================
// จัดการการแจ้งเตือน
// ============================================

// จับการคลิกที่ notification
self.addEventListener('notificationclick', (event) => {
  console.log('🔘 Notification clicked:', event.notification.tag);
  
  event.notification.close();
  
  const action = event.action;
  const data = event.notification.data;
  
  switch(action) {
    case 'open':
      // เปิดแอป
      event.waitUntil(
        clients.matchAll({
          type: 'window',
          includeUncontrolled: true
        }).then((clientList) => {
          // หา client ที่เปิดอยู่
          for (const client of clientList) {
            if (client.url.includes('/') && 'focus' in client) {
              return client.focus().then(() => {
                // ส่งข้อความไปยัง client
                client.postMessage({
                  type: 'NOTIFICATION_CLICKED',
                  data: data
                });
              });
            }
          }
          
          // ถ้าไม่มี client ที่เปิดอยู่ ให้เปิดใหม่
          if (clients.openWindow) {
            return clients.openWindow('/').then((client) => {
              if (client) {
                // ส่งข้อความเมื่อ client พร้อม
                client.postMessage({
                  type: 'NOTIFICATION_CLICKED',
                  data: data
                });
              }
            });
          }
        })
      );
      break;
      
    case 'snooze':
      // เลื่อนการแจ้งเตือน
      event.waitUntil(
        snoozeAlarm(data.alarmId)
      );
      break;
      
    case 'dismiss':
      // ปิดการแจ้งเตือน
      event.waitUntil(
        dismissAlarm(data.alarmId)
      );
      break;
      
    default:
      // คลิกที่ notification โดยตรง
      event.waitUntil(
        clients.openWindow('/').then((client) => {
          if (client) {
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              data: data
            });
          }
        })
      );
  }
});

// เลื่อนการแจ้งเตือน
async function snoozeAlarm(alarmId) {
  console.log('⏰ Snoozing alarm:', alarmId);
  
  const db = await getDB();
  if (!db) return;
  
  const transaction = db.transaction(['alarms'], 'readwrite');
  const store = transaction.objectStore('alarms');
  const request = store.get(alarmId);
  
  request.onsuccess = function() {
    const alarm = request.result;
    if (alarm) {
      // เลื่อนไป 5 นาที
      const snoozeTime = new Date();
      snoozeTime.setMinutes(snoozeTime.getMinutes() + 5);
      
      alarm.datetime = snoozeTime.toISOString();
      alarm.triggered = false;
      alarm.snoozed = true;
      store.put(alarm);
      
      console.log('⏰ Alarm snoozed until:', snoozeTime);
    }
  };
}

// ปิดการแจ้งเตือน
async function dismissAlarm(alarmId) {
  console.log('❌ Dismissing alarm:', alarmId);
  
  const db = await getDB();
  if (!db) return;
  
  const transaction = db.transaction(['alarms'], 'readwrite');
  const store = transaction.objectStore('alarms');
  const request = store.get(alarmId);
  
  request.onsuccess = function() {
    const alarm = request.result;
    if (alarm) {
      alarm.dismissed = true;
      store.put(alarm);
    }
  };
}

// จับการปิด notification
self.addEventListener('notificationclose', (event) => {
  console.log('🔘 Notification closed:', event.notification.tag);
});

// ============================================
// รับข้อความจากแอปพลิเคชัน
// ============================================

self.addEventListener('message', (event) => {
  console.log('📨 Service Worker received message:', event.data);
  
  const data = event.data;
  
  switch(data.type) {
    case 'SCHEDULE_ALARM':
      scheduleAlarm(data.alarm);
      break;
      
    case 'SHOW_NOTIFICATION':
      showCustomNotification(data.title, data.body, data.tag, data.data);
      break;
      
    case 'GET_ALARMS':
      sendAlarmsToClient(event.source);
      break;
      
    case 'CLEAR_NOTIFICATIONS':
      clearNotifications();
      break;
  }
});

// ตั้งเวลาแจ้งเตือน
async function scheduleAlarm(alarm) {
  console.log('⏰ Scheduling alarm:', alarm.title);
  
  const db = await getDB();
  if (!db) return;
  
  const transaction = db.transaction(['alarms'], 'readwrite');
  const store = transaction.objectStore('alarms');
  
  // ตรวจสอบว่ามีอยู่แล้วหรือไม่
  const request = store.get(alarm.id);
  
  request.onsuccess = function() {
    if (!request.result) {
      store.put(alarm);
      console.log('✅ Alarm scheduled:', alarm.title);
    }
  };
}

// แสดงการแจ้งเตือนแบบกำหนดเอง
function showCustomNotification(title, body, tag = 'custom', data = {}) {
  const options = {
    body: body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: tag,
    data: data,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    silent: false
  };
  
  if (data.urgent) {
    options.requireInteraction = true;
    options.vibrate = [1000, 500, 1000];
  }
  
  self.registration.showNotification(title, options);
}

// ส่ง alarms ไปยัง client
async function sendAlarmsToClient(client) {
  const db = await getDB();
  if (!db) return;
  
  const transaction = db.transaction(['alarms'], 'readonly');
  const store = transaction.objectStore('alarms');
  const request = store.getAll();
  
  request.onsuccess = function() {
    const alarms = request.result || [];
    client.postMessage({
      type: 'ALARMS_DATA',
      alarms: alarms
    });
  };
}

// ล้าง notifications
function clearNotifications() {
  // ลบ notifications ทั้งหมด
  self.registration.getNotifications().then((notifications) => {
    notifications.forEach((notification) => {
      notification.close();
    });
  });
}

// ============================================
// ดักจับการ fetch
// ============================================

self.addEventListener('fetch', (event) => {
  // สำหรับ offline support
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

// ============================================
// ตั้งค่า Periodic Sync (สำหรับ Chrome)
// ============================================

// ตรวจสอบการรองรับ periodic sync
if ('periodicSync' in self.registration) {
  self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-alarms') {
      console.log('🔄 Periodic sync triggered');
      event.waitUntil(checkScheduledAlarms());
    }
  });
}

// ============================================
// ตั้งค่า Background Fetch (สำหรับดาวน์โหลด)
// ============================================

if ('backgroundFetch' in self.registration) {
  self.addEventListener('backgroundfetchsuccess', (event) => {
    console.log('✅ Background fetch successful:', event.registration.id);
  });
  
  self.addEventListener('backgroundfetchfail', (event) => {
    console.log('❌ Background fetch failed:', event.registration.id);
  });
}

// ============================================
// ตั้งค่า Push Notifications
// ============================================

self.addEventListener('push', (event) => {
  let data = {};
  
  try {
    data = event.data ? JSON.parse(event.data.text()) : {};
  } catch (e) {
    data = {
      title: 'การแจ้งเตือน',
      body: 'คุณมีข้อความใหม่',
      data: {}
    };
  }
  
  const options = {
    body: data.body || 'การแจ้งเตือนจากระบบ',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: data.tag || 'push',
    data: data.data || {},
    requireInteraction: true,
    vibrate: [200, 100, 200]
  };
  
  if (data.urgent) {
    options.requireInteraction = true;
    options.vibrate = [1000, 500, 1000];
  }
  
  event.waitUntil(
    self.registration.showNotification(
      data.title || 'ระบบแจ้งเตือน',
      options
    )
  );
});

console.log('✅ Service Worker loaded successfully');
