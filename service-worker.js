// sw.js - Service Worker สำหรับการแจ้งเตือนเบื้องหลัง
const CACHE_NAME = 'notification-system-v1';
const VERSION = '2.1.0';

// ติดตั้ง Service Worker
self.addEventListener('install', (event) => {
  console.log('✅ Service Worker ถูกติดตั้ง');
  self.skipWaiting();
  
  // เคลียร์ cache เก่า
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// เปิดใช้งาน Service Worker
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker ทำงานแล้ว');
  event.waitUntil(clients.claim());
  
  // ส่งสัญญาณว่า Service Worker พร้อมทำงาน
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'SERVICE_WORKER_READY',
        version: VERSION
      });
    });
  });
});

// จัดการข้อความจาก main app
self.addEventListener('message', (event) => {
  console.log('📨 Service Worker ได้รับข้อความ:', event.data);
  
  switch(event.data.type) {
    case 'SCHEDULE_ALARM':
      scheduleAlarm(event.data.alarm);
      break;
      
    case 'SYNC_ALARMS':
      syncAlarms(event.data.alarms);
      break;
      
    case 'CANCEL_ALARM':
      cancelAlarm(event.data.alarmId);
      break;
      
    case 'SEND_BROADCAST':
      sendBroadcast(event.data.broadcast);
      break;
  }
});

// จัดเก็บเวลาที่ตั้งไว้
const scheduledAlarms = {};

// ตั้งเวลาแจ้งเตือน
function scheduleAlarm(alarm) {
  const alarmTime = new Date(alarm.datetime).getTime();
  const now = Date.now();
  const delay = alarmTime - now;
  
  if (delay <= 0) {
    // ถ้าเลยเวลาแล้ว ให้แจ้งเตือนทันที
    triggerAlarm(alarm);
    return;
  }
  
  // ยกเลิกอันเก่าถ้ามี
  if (scheduledAlarms[alarm.id]) {
    clearTimeout(scheduledAlarms[alarm.id]);
    delete scheduledAlarms[alarm.id];
  }
  
  // ตั้งเวลาใหม่
  scheduledAlarms[alarm.id] = setTimeout(() => {
    triggerAlarm(alarm);
    delete scheduledAlarms[alarm.id];
  }, delay);
  
  console.log(`⏰ Service Worker: ตั้งเวลา "${alarm.title}" ในอีก ${Math.round(delay/1000)} วินาที`);
}

// ซิงค์รายการแจ้งเตือน
function syncAlarms(alarms) {
  // ยกเลิกทั้งหมดก่อน
  Object.keys(scheduledAlarms).forEach(id => {
    clearTimeout(scheduledAlarms[id]);
    delete scheduledAlarms[id];
  });
  
  // ตั้งเวลาใหม่
  alarms.forEach(alarm => {
    scheduleAlarm(alarm);
  });
  
  console.log(`✅ Service Worker: ซิงค์ ${alarms.length} รายการแจ้งเตือน`);
}

// ยกเลิกการแจ้งเตือน
function cancelAlarm(alarmId) {
  if (scheduledAlarms[alarmId]) {
    clearTimeout(scheduledAlarms[alarmId]);
    delete scheduledAlarms[alarmId];
    console.log(`✅ Service Worker: ยกเลิกแจ้งเตือน ${alarmId}`);
  }
}

// ส่งการแจ้งเตือน
function triggerAlarm(alarm) {
  console.log('🔔 Service Worker: กำลังแจ้งเตือน', alarm.title);
  
  // ส่งแจ้งเตือน
  self.registration.showNotification(alarm.title, {
    body: alarm.description || 'ถึงเวลาแจ้งเตือนแล้ว',
    icon: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Ctext y=\'.9em\' font-size=\'90\'%3E🔔%3C/text%3E%3C/svg%3E',
    badge: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Ctext y=\'.9em\' font-size=\'90\'%3E🔔%3C/text%3E%3C/svg%3E',
    tag: alarm.id,
    requireInteraction: alarm.priority === 'high',
    vibrate: alarm.vibrate ? [200, 100, 200, 100, 200] : undefined,
    data: {
      alarmId: alarm.id,
      type: 'alarm',
      time: Date.now()
    }
  });
  
  // ส่งไปยัง client ที่เปิดอยู่
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'ALARM_TRIGGERED',
        alarm: alarm
      });
    });
  });
}

// ส่ง broadcast
function sendBroadcast(broadcast) {
  self.registration.showNotification(broadcast.title, {
    body: broadcast.message,
    icon: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Ctext y=\'.9em\' font-size=\'90\'%3E🔔%3C/text%3E%3C/svg%3E',
    badge: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Ctext y=\'.9em\' font-size=\'90\'%3E🔔%3C/text%3E%3C/svg%3E',
    tag: broadcast.id,
    requireInteraction: broadcast.urgent,
    vibrate: broadcast.urgent ? [500, 200, 500, 200, 500] : undefined,
    data: {
      broadcastId: broadcast.id,
      type: 'broadcast',
      time: Date.now()
    }
  });
}

// จัดการเมื่อคลิกการแจ้งเตือน
self.addEventListener('notificationclick', (event) => {
  console.log('🔘 คลิกการแจ้งเตือน:', event.notification);
  
  event.notification.close();
  
  // เปิดแอป
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        if (clientList.length > 0) {
          return clientList[0].focus();
        }
        return clients.openWindow('/');
      })
      .then(client => {
        if (client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: event.notification.data
          });
        }
      })
  );
});

// จัดการเมื่อปิดการแจ้งเตือน
self.addEventListener('notificationclose', (event) => {
  console.log('❌ ปิดการแจ้งเตือน:', event.notification);
});

// จัดการ push notification จาก server
self.addEventListener('push', (event) => {
  console.log('📡 ได้รับ push notification:', event);
  
  let data = { title: 'การแจ้งเตือน', body: 'มีข้อความใหม่' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Ctext y=\'.9em\' font-size=\'90\'%3E🔔%3C/text%3E%3C/svg%3E',
      badge: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Ctext y=\'.9em\' font-size=\'90\'%3E🔔%3C/text%3E%3C/svg%3E',
      vibrate: [200, 100, 200]
    })
  );
});

// fetch event (สำหรับ offline support)
self.addEventListener('fetch', (event) => {
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

console.log('🚀 Service Worker พร้อมทำงาน');
