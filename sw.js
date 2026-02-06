// sw.js - Service Worker สำหรับแจ้งเตือนแม้ปิดแอปและล็อคหน้าจอ
const CACHE_NAME = 'notification-system-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// IndexedDB สำหรับเก็บ alarms
let db;
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
      db = event.target.result;
      
      // สร้าง object store สำหรับ alarms
      if (!db.objectStoreNames.contains('alarms')) {
        const store = db.createObjectStore('alarms', { keyPath: 'id' });
        store.createIndex('datetime', 'datetime', { unique: false });
        store.createIndex('triggered', 'triggered', { unique: false });
      }
    };
    
    request.onsuccess = function(event) {
      db = event.target.result;
      console.log('✅ IndexedDB initialized');
      resolve();
    };
    
    request.onerror = function(event) {
      console.error('❌ IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
  });
}

// เริ่มตรวจสอบ alarms
let alarmCheckerInterval = null;
function startAlarmChecker() {
  if (alarmCheckerInterval) return;
  
  console.log('⏰ Starting alarm checker');
  
  // ตรวจสอบทุก 30 วินาที
  alarmCheckerInterval = setInterval(() => {
    checkScheduledAlarms();
  }, 30000);
  
  // ตรวจสอบทันทีที่เปิด
  setTimeout(() => {
    checkScheduledAlarms();
  }, 1000);
}

// ตรวจสอบ alarms ที่ต้องแจ้งเตือน
async function checkScheduledAlarms() {
  try {
    if (!db) {
      console.log('❌ Database not ready');
      return;
    }
    
    const now = new Date().toISOString();
    console.log('⏰ Checking alarms at:', now);
    
    const transaction = db.transaction(['alarms'], 'readonly');
    const store = transaction.objectStore('alarms');
    const index = store.index('datetime');
    
    // ดึง alarms ที่ยังไม่แจ้งเตือนและถึงเวลาแล้ว
    const range = IDBKeyRange.upperBound(now);
    const request = index.openCursor(range);
    
    const alarmsToTrigger = [];
    
    request.onsuccess = function(event) {
      const cursor = event.target.result;
      if (cursor) {
        const alarm = cursor.value;
        
        if (!alarm.triggered) {
          console.log('🔔 Found alarm to trigger:', alarm.title);
          alarmsToTrigger.push(alarm);
        }
        cursor.continue();
      } else {
        // แจ้งเตือน alarms ทั้งหมดที่ต้องแจ้ง
        alarmsToTrigger.forEach(alarm => {
          triggerAlarm(alarm);
        });
      }
    };
    
  } catch (error) {
    console.error('❌ Error checking alarms:', error);
  }
}

// แจ้งเตือนเมื่อถึงเวลา
async function triggerAlarm(alarm) {
  console.log('🔔 Triggering alarm:', alarm.title);
  
  try {
    // อัปเดตสถานะใน IndexedDB
    const transaction = db.transaction(['alarms'], 'readwrite');
    const store = transaction.objectStore('alarms');
    
    alarm.triggered = true;
    alarm.triggered_at = new Date().toISOString();
    await store.put(alarm);
    
    console.log('✅ Updated alarm status in IndexedDB');
    
  } catch (error) {
    console.error('❌ Failed to update alarm status:', error);
  }
  
  // แสดงการแจ้งเตือนแบบด่วน (แสดงแม้ล็อคหน้าจอ)
  const options = {
    body: alarm.description || 'เวลาแจ้งเตือนถึงแล้ว!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: `alarm_${alarm.id}`,
    requireInteraction: true, // บังคับให้ผู้ใช้ต้องกด
    silent: false, // เปิดเสียง
    vibrate: [1000, 500, 1000, 500, 1000], // สั่นแบบยาว
    data: {
      type: 'alarm',
      alarmId: alarm.id,
      url: '/',
      timestamp: Date.now(),
      urgent: true
    },
    actions: [
      {
        action: 'open',
        title: 'เปิดแอป'
      },
      {
        action: 'snooze',
        title: 'เลื่อน 5 นาที'
      }
    ]
  };
  
  try {
    await self.registration.showNotification(`⏰ ${alarm.title}`, options);
    console.log('✅ Notification shown for:', alarm.title);
    
    // ส่งข้อความไปยังแอปถ้าเปิดอยู่
    sendMessageToClients({
      type: 'ALARM_TRIGGERED',
      alarm: alarm
    });
    
  } catch (error) {
    console.error('❌ Failed to show notification:', error);
  }
}

// รับข้อความจากแอปพลิเคชัน
self.addEventListener('message', async (event) => {
  console.log('📨 Service Worker received:', event.data.type);
  
  const data = event.data;
  
  switch(data.type) {
    case 'SCHEDULE_ALARM':
      await scheduleAlarm(data.alarm);
      break;
      
    case 'TRIGGER_ALARM':
      await triggerAlarmFromApp(data.alarm, data.urgent);
      break;
      
    case 'APP_READY':
      console.log('✅ App is ready, user:', data.userId);
      event.source.postMessage({
        type: 'SERVICE_WORKER_READY',
        timestamp: Date.now()
      });
      break;
      
    case 'TEST_NOTIFICATION':
      await showTestNotification(data);
      break;
  }
});

// ตั้งเวลาแจ้งเตือน
async function scheduleAlarm(alarm) {
  console.log('⏰ Scheduling alarm:', alarm.title);
  
  try {
    const transaction = db.transaction(['alarms'], 'readwrite');
    const store = transaction.objectStore('alarms');
    
    // ตรวจสอบว่ามีอยู่แล้วหรือไม่
    const existing = await store.get(alarm.id);
    
    if (!existing) {
      await store.put(alarm);
      console.log('✅ Alarm scheduled:', alarm.title);
    } else {
      console.log('⚠️ Alarm already exists:', alarm.id);
    }
    
  } catch (error) {
    console.error('❌ Failed to schedule alarm:', error);
  }
}

// แจ้งเตือนจากแอป
async function triggerAlarmFromApp(alarm, urgent = false) {
  const options = {
    body: alarm.description || 'เวลาแจ้งเตือนถึงแล้ว!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: `alarm_${alarm.id}_${Date.now()}`,
    requireInteraction: true,
    silent: false,
    vibrate: urgent ? [1000, 500, 1000, 500, 1000] : [500, 200, 500],
    data: {
      type: 'alarm',
      alarmId: alarm.id,
      urgent: urgent,
      url: '/',
      timestamp: Date.now()
    }
  };
  
  try {
    await self.registration.showNotification(
      urgent ? `🚨 ${alarm.title}` : `⏰ ${alarm.title}`,
      options
    );
    console.log('✅ App notification shown');
  } catch (error) {
    console.error('❌ Failed to show app notification:', error);
  }
}

// แสดงการแจ้งเตือนทดสอบ
async function showTestNotification(data) {
  const options = {
    body: data.message || 'นี่คือการทดสอบการแจ้งเตือนเบื้องหลัง',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: `test_${Date.now()}`,
    requireInteraction: true,
    silent: false,
    vibrate: [500, 200, 500],
    data: {
      type: 'test',
      timestamp: Date.now(),
      url: '/'
    }
  };
  
  try {
    await self.registration.showNotification(data.title || 'ทดสอบการแจ้งเตือน', options);
    console.log('✅ Test notification shown');
  } catch (error) {
    console.error('❌ Failed to show test notification:', error);
  }
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

// จับการคลิกที่ notification
self.addEventListener('notificationclick', (event) => {
  console.log('🔘 Notification clicked:', event.notification.tag);
  
  event.notification.close();
  
  const action = event.action;
  const data = event.notification.data;
  
  if (action === 'open' || !action) {
    event.waitUntil(
      clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      }).then((clientList) => {
        // หา client ที่เปิดอยู่
        for (const client of clientList) {
          if (client.url.includes('/') && 'focus' in client) {
            client.focus();
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              data: data
            });
            return;
          }
        }
        
        // ถ้าไม่มี client ที่เปิดอยู่ ให้เปิดใหม่
        if (clients.openWindow) {
          return clients.openWindow('/').then((client) => {
            if (client) {
              client.postMessage({
                type: 'NOTIFICATION_CLICKED',
                data: data
              });
            }
          });
        }
      })
    );
  }
  
  if (action === 'snooze') {
    event.waitUntil(snoozeAlarm(data.alarmId));
  }
});

// เลื่อนการแจ้งเตือน
async function snoozeAlarm(alarmId) {
  console.log('⏰ Snoozing alarm:', alarmId);
  
  try {
    const transaction = db.transaction(['alarms'], 'readwrite');
    const store = transaction.objectStore('alarms');
    
    const alarm = await store.get(alarmId);
    
    if (alarm) {
      // เลื่อนไป 5 นาที
      const snoozeTime = new Date();
      snoozeTime.setMinutes(snoozeTime.getMinutes() + 5);
      
      alarm.datetime = snoozeTime.toISOString();
      alarm.triggered = false;
      alarm.snoozed = true;
      
      await store.put(alarm);
      console.log('⏰ Alarm snoozed until:', snoozeTime);
    }
    
  } catch (error) {
    console.error('❌ Failed to snooze alarm:', error);
  }
}

// ดักจับการ fetch
self.addEventListener('fetch', (event) => {
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

// Push notifications
self.addEventListener('push', (event) => {
  console.log('📨 Push event received');
  
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
