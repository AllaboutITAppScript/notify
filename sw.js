// Service Worker สำหรับระบบแจ้งเตือนรวมศูนย์
const CACHE_NAME = 'notification-system-v2.0';
const VERSION = '2.0.0';

// ตัวแปรเก็บ alarms
let scheduledAlarms = new Map();

// ติดตั้ง Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] 📥 Installing Service Worker v' + VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] 📦 Opened cache');
        // ไม่ต้อง cache อะไรเพิ่มเติม ใช้ network-first strategy
        return Promise.resolve();
      })
      .then(() => {
        console.log('[SW] ✅ Installed successfully');
        return self.skipWaiting();
      })
  );
});

// เปิดใช้งาน Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] 🔥 Activated');
  
  event.waitUntil(
    Promise.all([
      // ล้าง cache เก่า
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              console.log('[SW] 🗑️ Deleting old cache:', cache);
              return caches.delete(cache);
            }
          })
        );
      }),
      
      // Claim clients ทั้งหมดทันที
      self.clients.claim()
    ]).then(() => {
      console.log('[SW] 🚀 Ready to handle background tasks');
      
      // แจ้งแอปหลักว่า service worker พร้อมแล้ว
      sendMessageToAllClients({
        type: 'SERVICE_WORKER_READY',
        message: 'Service Worker พร้อมทำงานในเบื้องหลัง'
      });
    })
  );
});

// ฟังก์ชันส่งข้อความไปยัง clients
function sendMessageToAllClients(message) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage(message);
    });
  });
}

// รับข้อความจากแอปหลัก
self.addEventListener('message', (event) => {
  console.log('[SW] 📨 Message from client:', event.data.type);
  
  const data = event.data;
  
  switch (data.type) {
    case 'SCHEDULE_ALARM':
      handleScheduleAlarm(data.alarm);
      break;
      
    case 'SYNC_ALARMS':
      handleSyncAlarms(data.alarms);
      break;
      
    case 'CANCEL_ALARM':
      handleCancelAlarm(data.alarmId);
      break;
      
    case 'TRIGGER_ALARM':
      handleTriggerAlarm(data.alarm, data.urgent);
      break;
      
    case 'SEND_BROADCAST':
      handleSendBroadcast(data.broadcast);
      break;
      
    case 'PING':
      event.ports[0].postMessage({ type: 'PONG' });
      break;
      
    case 'GET_SCHEDULED_ALARMS':
      event.ports[0].postMessage({ 
        type: 'SCHEDULED_ALARMS',
        alarms: Array.from(scheduledAlarms.values())
      });
      break;
  }
});

// จัดการตั้งเวลาแจ้งเตือน
function handleScheduleAlarm(alarm) {
  console.log(`[SW] ⏰ Scheduling alarm: ${alarm.title}`, alarm);
  
  const alarmTime = new Date(alarm.datetime).getTime();
  const now = Date.now();
  const delay = alarmTime - now;
  
  if (delay <= 0) {
    console.log('[SW] ⚡ Alarm time has passed, triggering immediately');
    handleTriggerAlarm(alarm, true);
    return;
  }
  
  // ตั้ง timeout สำหรับ alarm
  const timeoutId = setTimeout(() => {
    console.log(`[SW] 🔔 Alarm triggered: ${alarm.title}`);
    handleTriggerAlarm(alarm, true);
    scheduledAlarms.delete(alarm.id);
  }, delay);
  
  // บันทึก alarm และ timeout ID
  scheduledAlarms.set(alarm.id, {
    ...alarm,
    timeoutId: timeoutId,
    scheduledTime: alarmTime
  });
  
  console.log(`[SW] ✅ Alarm "${alarm.title}" scheduled in ${Math.round(delay/1000)} seconds`);
}

// จัดการ sync alarms
function handleSyncAlarms(alarms) {
  console.log(`[SW] 🔄 Syncing ${alarms.length} alarms`);
  
  // ล้าง alarms เก่าทั้งหมด
  scheduledAlarms.forEach((alarm, id) => {
    clearTimeout(alarm.timeoutId);
  });
  scheduledAlarms.clear();
  
  // ตั้ง alarms ใหม่
  alarms.forEach(alarm => {
    if (!alarm.triggered) {
      handleScheduleAlarm(alarm);
    }
  });
  
  console.log(`[SW] ✅ Scheduled ${scheduledAlarms.size} alarms`);
}

// จัดการยกเลิก alarm
function handleCancelAlarm(alarmId) {
  console.log(`[SW] ❌ Canceling alarm: ${alarmId}`);
  
  const alarm = scheduledAlarms.get(alarmId);
  if (alarm) {
    clearTimeout(alarm.timeoutId);
    scheduledAlarms.delete(alarmId);
    console.log('[SW] ✅ Alarm canceled');
  }
}

// จัดการ trigger alarm
function handleTriggerAlarm(alarm, urgent = false) {
  console.log(`[SW] 🚨 Triggering alarm: ${alarm.title}`);
  
  const alarmTypeText = alarm.type === 'public' ? ' (แจ้งทุกคน)' : ' (ส่วนตัว)';
  const title = alarm.title + alarmTypeText;
  const body = alarm.description || 'เวลาแจ้งเตือนถึงแล้ว!';
  
  // ตั้งค่า options สำหรับ notification
  const options = {
    body: body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: `alarm_${alarm.id}_${Date.now()}`,
    requireInteraction: true,
    data: {
      alarmId: alarm.id,
      type: 'alarm',
      alarmType: alarm.type,
      urgent: urgent,
      time: Date.now(),
      url: '/'
    },
    actions: [
      {
        action: 'view',
        title: 'ดูรายละเอียด'
      },
      {
        action: 'dismiss',
        title: 'ปิด'
      }
    ],
    // สำหรับ Android ให้ใช้ vibrate
    vibrate: alarm.vibrate ? [1000, 500, 1000, 500, 1000] : undefined
  };
  
  // ส่ง notification
  self.registration.showNotification(title, options)
    .then(() => {
      console.log('[SW] 📢 Notification shown successfully');
      
      // บอกแอปหลักว่า alarm ถูก triggered แล้ว
      sendMessageToAllClients({
        type: 'ALARM_TRIGGERED',
        alarm: alarm
      });
      
      // ลบ alarm จากรายการ scheduled
      scheduledAlarms.delete(alarm.id);
    })
    .catch(error => {
      console.error('[SW] ❌ Failed to show notification:', error);
    });
}

// จัดการส่ง broadcast
function handleSendBroadcast(broadcast) {
  console.log(`[SW] 📡 Sending broadcast: ${broadcast.title}`);
  
  const options = {
    body: broadcast.message,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: `broadcast_${broadcast.id}_${Date.now()}`,
    requireInteraction: broadcast.urgent,
    data: {
      broadcastId: broadcast.id,
      type: 'broadcast',
      urgent: broadcast.urgent,
      time: Date.now(),
      url: '/'
    },
    actions: [
      {
        action: 'view',
        title: 'ดูประกาศ'
      },
      {
        action: 'dismiss',
        title: 'ปิด'
      }
    ],
    vibrate: broadcast.urgent ? [1000, 500, 1000, 500, 1000] : undefined
  };
  
  self.registration.showNotification(broadcast.title, options)
    .then(() => {
      console.log('[SW] ✅ Broadcast notification sent');
    })
    .catch(error => {
      console.error('[SW] ❌ Failed to send broadcast notification:', error);
    });
}

// จัดการเมื่อมีการคลิก notification
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 👆 Notification clicked:', event.notification.data);
  
  event.notification.close();
  
  const data = event.notification.data;
  
  if (event.action === 'dismiss') {
    return;
  }
  
  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      // พยายามเปิดหน้าเว็บที่มีอยู่
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: data
          });
          return client.focus();
        }
      }
      
      // ถ้าไม่มี client ที่เปิดอยู่ ให้เปิดหน้าใหม่
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

// จัดการเมื่อ notification ปิด
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] ❌ Notification closed:', event.notification.data);
});

// Background Sync (ถ้ารองรับ)
if ('sync' in self.registration) {
  self.addEventListener('sync', (event) => {
    console.log(`[SW] 🔄 Background sync: ${event.tag}`);
    
    if (event.tag === 'sync-alarms') {
      event.waitUntil(syncAlarmsWithServer());
    }
  });
}

// Periodic Background Sync (ถ้ารองรับ)
if ('periodicSync' in self.registration) {
  self.addEventListener('periodicsync', (event) => {
    console.log(`[SW] ⏱️ Periodic sync: ${event.tag}`);
    
    if (event.tag === 'update-check') {
      event.waitUntil(checkForUpdates());
    }
  });
}

async function syncAlarmsWithServer() {
  try {
    console.log('[SW] 🔄 Syncing alarms with server');
    // ในทางปฏิบัติควรเรียก API เพื่อ sync ข้อมูล
    // สำหรับตอนนี้แค่ส่งข้อความไปยังแอปหลัก
    sendMessageToAllClients({
      type: 'BACKGROUND_SYNC_COMPLETE',
      message: 'Background sync completed at ' + new Date().toLocaleString()
    });
  } catch (error) {
    console.error('[SW] ❌ Sync failed:', error);
  }
}

async function checkForUpdates() {
  console.log('[SW] 🔍 Checking for updates');
  // ตรวจสอบการอัปเดต
}

// Periodic task สำหรับตรวจสอบ alarms
setInterval(() => {
  const now = Date.now();
  let triggeredCount = 0;
  
  scheduledAlarms.forEach((alarm, id) => {
    if (alarm.scheduledTime <= now) {
      console.log(`[SW] ⏰ Found overdue alarm: ${alarm.title}`);
      handleTriggerAlarm(alarm, true);
      triggeredCount++;
    }
  });
  
  if (triggeredCount > 0) {
    console.log(`[SW] 🎯 Triggered ${triggeredCount} overdue alarms`);
  }
}, 30000); // ตรวจสอบทุก 30 วินาที

// แสดงสถานะเมื่อ service worker เริ่มทำงาน
console.log('[SW] 🚀 Service Worker loaded and ready');
