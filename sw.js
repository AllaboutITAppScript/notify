// Service Worker สำหรับระบบแจ้งเตือน - เวอร์ชันแก้ไข
const CACHE_NAME = 'notification-system-v2.0';
const APP_NAME = 'ระบบแจ้งเตือนรวมศูนย์';

console.log('🚀 Service Worker: กำลังโหลด...');

// ติดตั้ง Service Worker
self.addEventListener('install', event => {
  console.log('📦 Service Worker: กำลังติดตั้ง...');
  
  // ข้ามขั้นตอนการรอ
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('📦 Service Worker: แคชไฟล์หลัก');
      return cache.addAll([
        './',
        './index.html',
        './manifest.json'
      ]);
    }).then(() => {
      console.log('✅ Service Worker: ติดตั้งสำเร็จ');
    })
  );
});

// แอคทีฟ Service Worker
self.addEventListener('activate', event => {
  console.log('🔧 Service Worker: กำลังแอคทีฟ...');
  
  // ยืนยันการควบคุมทันที
  event.waitUntil(
    Promise.all([
      // ล้างแคชเก่า
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('🗑️ ลบแคชเก่า:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // ควบคุมทันที
      self.clients.claim()
    ]).then(() => {
      console.log('✅ Service Worker: แอคทีฟและควบคุมเรียบร้อย');
      
      // แจ้งเตือนทุกหน้าว่า Service Worker พร้อม
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SERVICE_WORKER_READY',
            message: 'Service Worker พร้อมทำงานแล้ว'
          });
        });
      });
    })
  );
});

// ตัวแปรเก็บการแจ้งเตือนที่ตั้งเวลาไว้
const scheduledNotifications = new Map();

// จัดการข้อความจากแอป
self.addEventListener('message', event => {
  console.log('📨 Service Worker: ได้รับข้อความจากแอป:', event.data.type);
  
  switch (event.data.type) {
    case 'SCHEDULE_ALARM':
      handleScheduleAlarm(event.data.alarm);
      break;
      
    case 'SYNC_ALARMS':
      handleSyncAlarms(event.data.alarms);
      break;
      
    case 'CANCEL_ALARM':
      handleCancelAlarm(event.data.alarmId);
      break;
      
    case 'SEND_BROADCAST':
      handleSendBroadcast(event.data.broadcast);
      break;
      
    case 'TRIGGER_ALARM':
      handleTriggerAlarm(event.data.alarm, event.data.urgent);
      break;
      
    case 'TEST_NOTIFICATION':
      handleTestNotification();
      break;
      
    case 'PING':
      event.ports[0].postMessage({
        type: 'PONG',
        message: 'Service Worker พร้อมใช้งาน',
        timestamp: Date.now()
      });
      break;
  }
});

// ฟังก์ชันตั้งเวลาแจ้งเตือน
function handleScheduleAlarm(alarm) {
  console.log('⏰ Service Worker: ตั้งเวลาแจ้งเตือน:', alarm.title);
  
  const alarmTime = new Date(alarm.datetime).getTime();
  const now = Date.now();
  const delay = alarmTime - now;
  
  console.log(`⏰ เวลาแจ้งเตือน: ${new Date(alarm.datetime).toLocaleString('th-TH')}`);
  console.log(`⏰ เวลาปัจจุบัน: ${new Date().toLocaleString('th-TH')}`);
  console.log(`⏰ หน่วงเวลา: ${delay}ms (${Math.round(delay/1000)} วินาที)`);
  
  if (delay > 0) {
    // ลบการตั้งเวลาเก่าถ้ามี
    handleCancelAlarm(alarm.id);
    
    // ตั้งเวลาใหม่
    const timeoutId = setTimeout(() => {
      console.log('🔔 Service Worker: ถึงเวลาแจ้งเตือน!', alarm.title);
      showAlarmNotification(alarm);
    }, delay);
    
    // บันทึกการตั้งเวลา
    scheduledNotifications.set(alarm.id, {
      timeoutId: timeoutId,
      alarm: alarm,
      scheduledTime: alarmTime
    });
    
    console.log(`✅ Service Worker: ตั้งเวลาแจ้งเตือนสำเร็จ ID: ${alarm.id}`);
    console.log(`📅 แจ้งเตือนที่ตั้งไว้: ${scheduledNotifications.size} รายการ`);
    
  } else {
    console.log('⚠️ Service Worker: เวลาแจ้งเตือนผ่านไปแล้ว, แจ้งเตือนทันที');
    
    // แจ้งเตือนทันที
    setTimeout(() => {
      showAlarmNotification(alarm);
    }, 1000);
  }
}

// ฟังก์ชันซิงค์ alarms หลายรายการ
function handleSyncAlarms(alarms) {
  console.log('🔄 Service Worker: ซิงค์ alarms:', alarms.length, 'รายการ');
  
  // ลบ alarms เก่าทั้งหมด
  scheduledNotifications.forEach((scheduled, alarmId) => {
    clearTimeout(scheduled.timeoutId);
  });
  scheduledNotifications.clear();
  
  // ตั้ง alarms ใหม่ทั้งหมด
  const now = Date.now();
  alarms.forEach(alarm => {
    if (!alarm.triggered) {
      handleScheduleAlarm(alarm);
    }
  });
  
  console.log(`✅ Service Worker: ซิงค์ alarms สำเร็จ, มี ${scheduledNotifications.size} alarms ที่ตั้งเวลาไว้`);
}

// ฟังก์ชันลบ alarm
function handleCancelAlarm(alarmId) {
  if (scheduledNotifications.has(alarmId)) {
    const scheduled = scheduledNotifications.get(alarmId);
    clearTimeout(scheduled.timeoutId);
    scheduledNotifications.delete(alarmId);
    console.log(`❌ Service Worker: ลบ alarm ${alarmId} สำเร็จ`);
  }
}

// ฟังก์ชันส่งประกาศ
function handleSendBroadcast(broadcast) {
  console.log('📢 Service Worker: ส่งประกาศ:', broadcast.title);
  
  const options = {
    body: broadcast.message,
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    tag: `broadcast_${Date.now()}`,
    requireInteraction: broadcast.urgent,
    silent: false,
    vibrate: broadcast.urgent ? [1000, 500, 1000, 500, 1000] : [200, 100, 200],
    timestamp: Date.now(),
    data: {
      type: 'broadcast',
      broadcastId: broadcast.id,
      urgent: broadcast.urgent,
      url: window.location.origin
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
    ]
  };
  
  self.registration.showNotification(broadcast.title, options)
    .then(() => {
      console.log('✅ Service Worker: แสดงประกาศสำเร็จ');
    })
    .catch(error => {
      console.error('❌ Service Worker: ไม่สามารถแสดงประกาศได้:', error);
    });
}

// ฟังก์ชันแจ้งเตือนทันที
function handleTriggerAlarm(alarm, urgent = false) {
  console.log('🔔 Service Worker: แจ้งเตือนทันที:', alarm.title);
  showAlarmNotification(alarm, urgent);
}

// ฟังก์ชันแสดงการแจ้งเตือน
function showAlarmNotification(alarm, urgent = false) {
  const title = alarm.type === 'personal' 
    ? `🔔 ${alarm.title}` 
    : `📢 ${alarm.title} (แจ้งทุกคน)`;
  
  const options = {
    body: alarm.description || 'เวลาแจ้งเตือนถึงแล้ว!',
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    tag: `alarm_${alarm.id}_${Date.now()}`,
    requireInteraction: urgent,
    silent: false,
    vibrate: urgent ? [1000, 500, 1000, 500, 1000] : [200, 100, 200],
    timestamp: Date.now(),
    data: {
      type: 'alarm',
      alarmId: alarm.id,
      alarmType: alarm.type,
      urgent: urgent,
      url: window.location.origin
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
    ]
  };
  
  console.log('🔔 Service Worker: พยายามแสดงการแจ้งเตือน:', title);
  
  self.registration.showNotification(title, options)
    .then(() => {
      console.log('✅ Service Worker: แสดงการแจ้งเตือนสำเร็จ');
      
      // ลบจากการติดตาม
      handleCancelAlarm(alarm.id);
      
      // แจ้งแอปว่าแจ้งเตือนแล้ว
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'ALARM_TRIGGERED',
            alarm: alarm
          });
        });
      });
    })
    .catch(error => {
      console.error('❌ Service Worker: ไม่สามารถแสดงการแจ้งเตือนได้:', error);
      console.error('❌ รายละเอียดข้อผิดพลาด:', error.message);
      
      // ลองอีกวิธีด้วย Notification API โดยตรง
      try {
        const notification = new Notification(title, options);
        console.log('✅ ใช้ Notification API โดยตรงสำเร็จ');
      } catch (e) {
        console.error('❌ Notification API โดยตรงก็ล้มเหลว:', e.message);
      }
    });
}

// ฟังก์ชันทดสอบการแจ้งเตือน
function handleTestNotification() {
  console.log('🧪 Service Worker: ทดสอบการแจ้งเตือน');
  
  const testAlarm = {
    id: 'test_' + Date.now(),
    title: 'ทดสอบการแจ้งเตือนจาก Service Worker',
    description: 'นี่คือการทดสอบว่า Service Worker ทำงานได้ถูกต้อง',
    type: 'personal',
    datetime: new Date().toISOString()
  };
  
  showAlarmNotification(testAlarm, true);
}

// จัดการเมื่อคลิกการแจ้งเตือน
self.addEventListener('notificationclick', event => {
  console.log('🔘 Service Worker: การแจ้งเตือนถูกคลิก:', event.notification.tag);
  
  const notification = event.notification;
  const action = event.action;
  const notificationData = notification.data || {};
  
  notification.close();
  
  // โฟกัสหรือเปิดแอป
  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(clients => {
      // ตรวจสอบว่ามีแอปเปิดอยู่แล้วหรือไม่
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: notificationData,
            action: action
          });
          return;
        }
      }
      
      // ถ้าไม่มีแอปเปิดอยู่ ให้เปิดใหม่
      if (self.clients.openWindow) {
        return self.clients.openWindow('/').then(client => {
          if (client) {
            setTimeout(() => {
              client.postMessage({
                type: 'NOTIFICATION_CLICKED',
                data: notificationData,
                action: action
              });
            }, 1000);
          }
        });
      }
    })
  );
});

// จัดการเมื่อปิดการแจ้งเตือน
self.addEventListener('notificationclose', event => {
  console.log('❌ Service Worker: การแจ้งเตือนถูกปิด:', event.notification.tag);
});

// Background Sync
self.addEventListener('sync', event => {
  console.log('🔄 Service Worker: Background Sync:', event.tag);
  
  if (event.tag === 'sync-alarms') {
    event.waitUntil(syncAlarmsWithServer());
  }
});

async function syncAlarmsWithServer() {
  console.log('🌐 Service Worker: ซิงค์กับเซิร์ฟเวอร์');
  
  try {
    // ตัวอย่างการดึงข้อมูลจากเซิร์ฟเวอร์
    const response = await fetch('https://jsonplaceholder.typicode.com/todos/1');
    const data = await response.json();
    
    console.log('✅ Service Worker: ซิงค์กับเซิร์ฟเวอร์สำเร็จ');
    
    // แจ้งแอป
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'BACKGROUND_SYNC_COMPLETE',
          data: data
        });
      });
    });
    
  } catch (error) {
    console.error('❌ Service Worker: ซิงค์กับเซิร์ฟเวอร์ล้มเหลว:', error);
  }
}

// Push Notifications
self.addEventListener('push', event => {
  console.log('📨 Service Worker: ได้รับ Push Notification');
  
  let data = {};
  
  try {
    if (event.data) {
      data = event.data.json();
    } else {
      data = {
        title: 'การแจ้งเตือนใหม่',
        body: 'มีแจ้งเตือนใหม่ในระบบ',
        icon: './icons/icon-192.png'
      };
    }
  } catch (e) {
    data = {
      title: 'การแจ้งเตือนใหม่',
      body: event.data ? event.data.text() : 'มีแจ้งเตือนใหม่ในระบบ',
      icon: './icons/icon-192.png'
    };
  }
  
  const options = {
    body: data.body || 'มีแจ้งเตือนใหม่ในระบบ',
    icon: data.icon || './icons/icon-192.png',
    badge: './icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: data.data || {},
    tag: `push_${Date.now()}`,
    requireInteraction: data.urgent || false
  };
  
  event.waitUntil(
    self.registration.showNotification(
      data.title || 'ระบบแจ้งเตือน',
      options
    ).then(() => {
      console.log('✅ Service Worker: แสดง Push Notification สำเร็จ');
    }).catch(error => {
      console.error('❌ Service Worker: ไม่สามารถแสดง Push Notification ได้:', error);
    })
  );
});

// ตรวจสอบ alarms เป็นระยะ (ทุก 60 วินาที)
setInterval(() => {
  console.log('⏰ Service Worker: ตรวจสอบ alarms ที่ตั้งไว้', scheduledNotifications.size, 'รายการ');
  
  const now = Date.now();
  scheduledNotifications.forEach((scheduled, alarmId) => {
    const timeLeft = scheduled.scheduledTime - now;
    if (timeLeft > 0 && timeLeft < 60000) { // น้อยกว่า 1 นาที
      console.log(`⏰ Alarm "${scheduled.alarm.title}" จะถึงเวลาใน ${Math.round(timeLeft/1000)} วินาที`);
    }
  });
}, 60000); // ทุก 1 นาที

// แจ้งเมื่อ Service Worker พร้อม
self.addEventListener('activate', event => {
  console.log('✅ Service Worker: พร้อมใช้งานแล้ว!');
});

// เพิ่มฟังก์ชันยูทิลิตี้
function logNotificationPermission() {
  if (navigator.permissions) {
    navigator.permissions.query({ name: 'notifications' }).then(result => {
      console.log('🔔 สถานะการอนุญาตการแจ้งเตือน:', result.state);
    });
  }
}

// ตรวจสอบเมื่อเริ่มต้น
logNotificationPermission();
