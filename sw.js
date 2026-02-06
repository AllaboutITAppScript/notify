// Service Worker สำหรับระบบแจ้งเตือนรวมศูนย์
const CACHE_NAME = 'notification-system-v1.2.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// ติดตั้ง Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: Installed');
        return self.skipWaiting();
      })
  );
});

// เปิดใช้งาน Service Worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activated');
  
  // ล้าง cache เก่า
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Claiming clients');
      return self.clients.claim();
    })
  );
  
  // แจ้งเตือนว่าพร้อมแล้ว
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'SERVICE_WORKER_READY',
        message: 'Service Worker พร้อมใช้งาน'
      });
    });
  });
});

// ดักจับ fetch requests
self.addEventListener('fetch', (event) => {
  // สำหรับไฟล์ static ให้ใช้ cache-first strategy
  if (event.request.url.includes('/icons/') || 
      event.request.url.includes('/styles/') ||
      event.request.url.includes('/scripts/')) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          return response || fetch(event.request);
        })
    );
  }
});

// รับข้อความจากแอป
self.addEventListener('message', (event) => {
  console.log('Service Worker: Received message', event.data);
  
  switch (event.data.type) {
    case 'APP_READY':
      console.log('Service Worker: App is ready');
      break;
      
    case 'SCHEDULE_ALARM':
      scheduleAlarmNotification(event.data.alarm);
      break;
      
    case 'SYNC_ALARMS':
      syncAlarms(event.data.alarms);
      break;
      
    case 'CANCEL_ALARM':
      cancelAlarmNotification(event.data.alarmId);
      break;
      
    case 'TRIGGER_ALARM':
      triggerAlarmNotification(event.data.alarm, event.data.urgent);
      break;
      
    case 'SEND_BROADCAST':
      sendBroadcastNotification(event.data.broadcast);
      break;
  }
});

// ฟังก์ชัน schedule alarms
function scheduleAlarmNotification(alarm) {
  console.log('Service Worker: Scheduling alarm', alarm.title);
  
  const alarmTime = new Date(alarm.datetime).getTime();
  const now = Date.now();
  const delay = Math.max(0, alarmTime - now);
  
  if (delay > 0) {
    // บันทึก alarm ใน IndexedDB หรือใช้ localStorage
    saveAlarmToStorage(alarm);
    
    // ตั้งเวลาแจ้งเตือน
    setTimeout(() => {
      triggerAlarmNotification(alarm, true);
    }, delay);
    
    console.log(`Service Worker: Alarm "${alarm.title}" scheduled in ${delay}ms`);
  } else {
    console.log('Service Worker: Alarm time has passed, triggering immediately');
    triggerAlarmNotification(alarm, true);
  }
}

// ฟังก์ชัน sync alarms
function syncAlarms(alarms) {
  console.log('Service Worker: Syncing alarms', alarms.length);
  
  // ล้าง alarms เก่า
  clearAllScheduledAlarms();
  
  // ตั้ง alarms ใหม่
  alarms.forEach(alarm => {
    if (!alarm.triggered) {
      scheduleAlarmNotification(alarm);
    }
  });
}

// ฟังก์ชัน cancel alarm
function cancelAlarmNotification(alarmId) {
  console.log('Service Worker: Canceling alarm', alarmId);
  // ในกรณีจริงควรใช้การ clear timeout
  // แต่สำหรับ demo นี้เราจะใช้การลบจาก storage
  removeAlarmFromStorage(alarmId);
}

// ฟังก์ชัน trigger alarm
function triggerAlarmNotification(alarm, urgent = false) {
  console.log('Service Worker: Triggering alarm', alarm.title);
  
  const options = {
    body: alarm.description || 'เวลาแจ้งเตือนถึงแล้ว!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: 'alarm_' + alarm.id,
    requireInteraction: urgent,
    silent: false,
    vibrate: alarm.vibrate ? [1000, 500, 1000, 500, 1000] : undefined,
    data: {
      alarmId: alarm.id,
      type: 'alarm',
      alarmType: alarm.type,
      urgent: urgent,
      time: Date.now()
    },
    // สำหรับการแจ้งเตือนขณะล็อคหน้าจอ
    showTrigger: true
  };
  
  // ส่งการแจ้งเตือน
  self.registration.showNotification(
    alarm.title + (alarm.type === 'public' ? ' (แจ้งทุกคน)' : ' (ส่วนตัว)'),
    options
  ).then(() => {
    console.log('Service Worker: Notification shown');
    
    // บอกแอปหลักว่า alarm ถูก triggered แล้ว
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'ALARM_TRIGGERED',
          alarm: alarm
        });
      });
    });
    
    // ลบ alarm จาก storage
    removeAlarmFromStorage(alarm.id);
    
  }).catch(error => {
    console.error('Service Worker: Failed to show notification', error);
  });
}

// ฟังก์ชัน send broadcast
function sendBroadcastNotification(broadcast) {
  console.log('Service Worker: Sending broadcast', broadcast.title);
  
  const options = {
    body: broadcast.message,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: 'broadcast_' + broadcast.id,
    requireInteraction: broadcast.urgent,
    silent: !broadcast.urgent,
    vibrate: broadcast.urgent ? [1000, 500, 1000, 500, 1000] : undefined,
    data: {
      broadcastId: broadcast.id,
      type: 'broadcast',
      urgent: broadcast.urgent,
      time: Date.now()
    },
    showTrigger: true
  };
  
  self.registration.showNotification(broadcast.title, options);
}

// ฟังก์ชันจัดการ storage (แบบง่ายๆ)
function saveAlarmToStorage(alarm) {
  // ใช้ IndexedDB หรือ localStorage ในทางปฏิบัติ
  // แต่สำหรับตัวอย่างนี้เราจะใช้ array ในการเก็บ
  if (!self.alarms) {
    self.alarms = [];
  }
  self.alarms.push(alarm);
}

function removeAlarmFromStorage(alarmId) {
  if (self.alarms) {
    self.alarms = self.alarms.filter(a => a.id !== alarmId);
  }
}

function clearAllScheduledAlarms() {
  self.alarms = [];
}

// ฟังก์ชัน Background Sync (ถ้ารองรับ)
if ('sync' in self.registration) {
  self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
      console.log('Service Worker: Background sync triggered');
      event.waitUntil(syncWithServer());
    }
  });
}

async function syncWithServer() {
  try {
    // ทำการ sync ข้อมูลกับเซิร์ฟเวอร์
    // ในทางปฏิบัติควรเรียก API เพื่อ sync ข้อมูล
    console.log('Service Worker: Syncing with server');
    
    // แจ้งเตือนแอปหลัก
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'BACKGROUND_SYNC',
          message: 'Background sync completed'
        });
      });
    });
    
  } catch (error) {
    console.error('Service Worker: Sync failed', error);
  }
}

// จัดการเมื่อมีการคลิก notification
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked', event.notification.data);
  
  event.notification.close();
  
  const data = event.notification.data;
  
  // บอกแอปหลักว่า notification ถูกคลิก
  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
            break;
          }
        }
        
        client.postMessage({
          type: 'NOTIFICATION_CLICKED',
          data: data
        });
        
        return client.focus();
      } else {
        // ถ้าไม่มี client ที่เปิดอยู่ ให้เปิดหน้าเว็บใหม่
        return self.clients.openWindow('/');
      }
    })
  );
});

// จัดการเมื่อ notification ปิด
self.addEventListener('notificationclose', (event) => {
  console.log('Service Worker: Notification closed', event.notification.data);
});

// Periodic Sync (สำหรับการอัปเดตเป็นระยะ)
if ('periodicSync' in self.registration) {
  self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-updates') {
      console.log('Service Worker: Periodic sync for updates');
      event.waitUntil(checkForUpdates());
    }
  });
}

async function checkForUpdates() {
  console.log('Service Worker: Checking for updates');
  // ตรวจสอบการอัปเดต
}
