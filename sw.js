// sw.js - Service Worker สำหรับแจ้งเตือนแม้ปิดแอปและล็อคหน้าจอ
const CACHE_NAME = 'notification-system-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json'
];

// ติดตั้ง Service Worker
self.addEventListener('install', (event) => {
  console.log('🟢 Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('🟢 Caching app shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => self.skipWaiting())
  );
});

// เปิดใช้งาน Service Worker
self.addEventListener('activate', (event) => {
  console.log('🟢 Service Worker: Activated');
  
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('🟢 Deleting old cache');
              return caches.delete(cacheName);
            }
          })
        );
      }),
      self.clients.claim()
    ])
  );
});

// IndexedDB สำหรับเก็บ alarms
let db;
const DB_NAME = 'AlarmDB';
const DB_VERSION = 1;

// เปิด IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = function(event) {
      db = event.target.result;
      if (!db.objectStoreNames.contains('alarms')) {
        const store = db.createObjectStore('alarms', { keyPath: 'id' });
        store.createIndex('datetime', 'datetime');
        store.createIndex('triggered', 'triggered');
      }
    };
    
    request.onsuccess = function(event) {
      db = event.target.result;
      console.log('✅ IndexedDB opened');
      resolve(db);
    };
    
    request.onerror = function(event) {
      console.error('❌ IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
  });
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
      
    case 'SEND_BROADCAST':
      await showBroadcastNotification(data.broadcast);
      break;
      
    case 'APP_READY':
      console.log('✅ App is ready, user:', data.userId);
      event.source.postMessage({
        type: 'SERVICE_WORKER_READY',
        timestamp: Date.now()
      });
      break;
  }
});

// ตั้งเวลาแจ้งเตือน
async function scheduleAlarm(alarm) {
  console.log('⏰ Scheduling alarm:', alarm.title);
  
  try {
    const db = await openDB();
    const transaction = db.transaction(['alarms'], 'readwrite');
    const store = transaction.objectStore('alarms');
    
    // เก็บ alarm
    await store.put(alarm);
    console.log('✅ Alarm scheduled in IndexedDB');
    
    // เริ่มตรวจสอบ alarms ถ้ายังไม่เริ่ม
    startAlarmChecker();
    
  } catch (error) {
    console.error('❌ Failed to schedule alarm:', error);
  }
}

// ตรวจสอบ alarms
let alarmCheckerInterval = null;
function startAlarmChecker() {
  if (alarmCheckerInterval) return;
  
  console.log('⏰ Starting alarm checker');
  alarmCheckerInterval = setInterval(checkAlarms, 30000); // ตรวจสอบทุก 30 วินาที
  
  // ตรวจสอบทันที
  checkAlarms();
}

async function checkAlarms() {
  try {
    const db = await openDB();
    const transaction = db.transaction(['alarms'], 'readonly');
    const store = transaction.objectStore('alarms');
    const index = store.index('datetime');
    
    const now = new Date().toISOString();
    const range = IDBKeyRange.upperBound(now);
    
    const request = index.openCursor(range);
    
    request.onsuccess = function(event) {
      const cursor = event.target.result;
      if (cursor) {
        const alarm = cursor.value;
        
        if (!alarm.triggered) {
          console.log('🔔 Time to trigger:', alarm.title);
          triggerAlarm(alarm);
        }
        cursor.continue();
      }
    };
    
  } catch (error) {
    console.error('❌ Error checking alarms:', error);
  }
}

// แจ้งเตือนเมื่อถึงเวลา
async function triggerAlarm(alarm) {
  console.log('🔔 Triggering alarm:', alarm.title);
  
  // อัปเดตสถานะใน IndexedDB
  try {
    const db = await openDB();
    const transaction = db.transaction(['alarms'], 'readwrite');
    const store = transaction.objectStore('alarms');
    
    alarm.triggered = true;
    alarm.triggeredAt = new Date().toISOString();
    await store.put(alarm);
    
  } catch (error) {
    console.error('❌ Failed to update alarm status:', error);
  }
  
  // แสดงการแจ้งเตือน
  const options = {
    body: alarm.description || 'เวลาแจ้งเตือนถึงแล้ว!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: `alarm_${alarm.id}`,
    requireInteraction: true,
    silent: false,
    vibrate: [500, 200, 500, 200, 500],
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
        title: 'เลื่อน 5 นาที'
      },
      {
        action: 'dismiss',
        title: 'ปิด'
      }
    ]
  };
  
  await self.registration.showNotification(`⏰ ${alarm.title}`, options);
  
  // ส่งข้อความไปยังแอป
  sendMessageToClients({
    type: 'ALARM_TRIGGERED',
    alarm: alarm
  });
}

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
  
  await self.registration.showNotification(
    urgent ? `🚨 ${alarm.title}` : `⏰ ${alarm.title}`,
    options
  );
}

async function showBroadcastNotification(broadcast) {
  const options = {
    body: broadcast.message,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: `broadcast_${broadcast.id}`,
    requireInteraction: broadcast.urgent,
    silent: false,
    vibrate: broadcast.urgent ? [1000, 500, 1000] : [200, 100, 200],
    data: {
      type: 'broadcast',
      broadcastId: broadcast.id,
      urgent: broadcast.urgent,
      url: '/',
      timestamp: Date.now()
    },
    actions: [
      {
        action: 'open',
        title: 'เปิดแอป'
      }
    ]
  };
  
  await self.registration.showNotification(broadcast.title, options);
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
    // เลื่อนการแจ้งเตือน
    event.waitUntil(snoozeAlarm(data.alarmId));
  }
});

async function snoozeAlarm(alarmId) {
  try {
    const db = await openDB();
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
