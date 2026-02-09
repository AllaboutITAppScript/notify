// sw.js
const CACHE_NAME = 'alarm-system-v3';
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwpOYJ_pB6Llu9bd7RJABMd0awxu09oVFPB1cK4zsq3-aBYze5EpSHTSGgO1EcSJ3DwpQ/exec";

// สร้างตัวแปรเก็บ alarms
let alarms = [];
let currentUserId = '';
let currentDeviceId = '';

// อีเวนต์ติดตั้ง Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker: กำลังติดตั้ง...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching ไฟล์หลัก');
        return cache.addAll([
          './',
          './index.html',
          './manifest.json'
        ]);
      })
      .then(() => self.skipWaiting())
  );
});

// อีเวนต์เปิดใช้งาน
self.addEventListener('activate', (event) => {
  console.log('Service Worker: เปิดใช้งานแล้ว');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: ลบ cache เก่า');
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      // ประกาศว่า Service Worker พร้อมใช้งาน
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SERVICE_WORKER_READY'
          });
        });
      });
      
      // เริ่มตรวจสอบ alarms ทันที
      startAlarmChecking();
      
      return self.clients.claim();
    })
  );
});

// จัดการ fetch requests
self.addEventListener('fetch', (event) => {
  // สำหรับไฟล์ static ให้ใช้ cache
  if (event.request.url.includes(location.origin)) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          return response || fetch(event.request);
        })
    );
  }
});

// รับข้อความจากแอปหลัก
self.addEventListener('message', (event) => {
  console.log('Service Worker: ได้รับข้อความ', event.data);
  
  switch(event.data.type) {
    case 'SYNC_ALARMS':
      alarms = event.data.alarms || [];
      currentUserId = event.data.userId;
      currentDeviceId = event.data.deviceId;
      console.log(`Service Worker: ซิงค์ alarms ${alarms.length} รายการ`);
      startAlarmChecking();
      break;
      
    case 'CHECK_ALARMS':
      checkAlarms();
      break;
      
    case 'ADD_ALARM':
      alarms.push(event.data.alarm);
      console.log('Service Worker: เพิ่ม alarm ใหม่');
      break;
      
    case 'REMOVE_ALARM':
      alarms = alarms.filter(a => a.id !== event.data.alarmId);
      console.log('Service Worker: ลบ alarm');
      break;
      
    case 'CLEAR_ALARMS':
      alarms = [];
      console.log('Service Worker: ล้าง alarms ทั้งหมด');
      break;
  }
});

// เริ่มการตรวจสอบ alarms
function startAlarmChecking() {
  console.log('Service Worker: เริ่มตรวจสอบ alarms...');
  
  // ตรวจสอบทุก 30 วินาที
  setInterval(() => {
    checkAlarms();
  }, 30000);
  
  // ตรวจสอบทันที
  checkAlarms();
}

// ตรวจสอบ alarms
function checkAlarms() {
  const now = new Date();
  console.log(`Service Worker: กำลังตรวจสอบ alarms (${alarms.length} รายการ)...`);
  
  alarms.forEach(alarm => {
    if (!alarm.triggered) {
      const alarmTime = new Date(alarm.datetime);
      
      // ถ้าถึงเวลาแล้ว
      if (alarmTime <= now) {
        triggerAlarm(alarm);
      }
      
      // ถ้าใกล้ถึงเวลา (ภายใน 5 นาที)
      const timeDiff = alarmTime - now;
      if (timeDiff > 0 && timeDiff <= 5 * 60 * 1000) {
        showUpcomingNotification(alarm);
      }
    }
  });
}

// แสดง notification เมื่อใกล้ถึงเวลา
function showUpcomingNotification(alarm) {
  const notificationTitle = `ใกล้ถึงเวลา: ${alarm.title}`;
  const notificationOptions = {
    body: alarm.description || 'เตรียมตัวให้พร้อม',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `upcoming-${alarm.id}`,
    requireInteraction: true,
    silent: false,
    data: {
      alarmId: alarm.id,
      type: 'upcoming_alarm'
    },
    actions: [
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
  
  self.registration.showNotification(notificationTitle, notificationOptions)
    .then(() => {
      console.log('Service Worker: แสดงการแจ้งเตือนใกล้ถึงเวลา');
    })
    .catch(err => {
      console.error('Service Worker: ผิดพลาดในการแสดง notification:', err);
    });
}

// Trigger alarm
function triggerAlarm(alarm) {
  console.log(`Service Worker: Trigger alarm: ${alarm.title}`);
  
  // อัปเดตสถานะในตัวแปร
  alarm.triggered = true;
  alarm.triggeredTime = new Date().toISOString();
  
  // ส่งข้อความกลับไปยังแอปหลัก
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'ALARM_TRIGGERED',
        alarm: alarm
      });
    });
  });
  
  // แสดง notification
  const notificationTitle = `แจ้งเตือน: ${alarm.title}`;
  const notificationOptions = {
    body: alarm.description || 'ถึงเวลาแล้ว!',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `alarm-${alarm.id}`,
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200, 100, 200],
    data: {
      alarmId: alarm.id,
      alarmTitle: alarm.title,
      alarmDescription: alarm.description,
      type: 'alarm',
      priority: alarm.priority || 'medium'
    },
    actions: [
      {
        action: 'view',
        title: 'ดูรายละเอียด'
      },
      {
        action: 'snooze',
        title: 'เลื่อน 10 นาที'
      }
    ]
  };
  
  // ตั้งค่าสำหรับ priority สูง
  if (alarm.priority === 'high') {
    notificationOptions.requireInteraction = true;
    notificationOptions.vibrate = [500, 200, 500, 200, 500];
  }
  
  self.registration.showNotification(notificationTitle, notificationOptions)
    .then(() => {
      console.log('Service Worker: แสดง notification สำเร็จ');
      
      // สำหรับ urgent alarms ให้แสดงอีกครั้งใน 30 วินาที
      if (alarm.priority === 'high') {
        setTimeout(() => {
          self.registration.showNotification(
            `ด่วน: ${alarm.title}`,
            {
              ...notificationOptions,
              tag: `urgent-${alarm.id}-${Date.now()}`
            }
          );
        }, 30000);
      }
    })
    .catch(err => {
      console.error('Service Worker: ผิดพลาดในการแสดง notification:', err);
    });
  
  // ตรวจสอบ public alarms
  if (alarm.isPublic && currentUserId) {
    syncPublicAlarm(alarm);
  }
}

// ซิงค์ public alarm กับเซิร์ฟเวอร์
function syncPublicAlarm(alarm) {
  const formData = new FormData();
  formData.append('action', 'update_public_alarm');
  formData.append('alarmId', alarm.id);
  formData.append('status', 'triggered');
  formData.append('userId', currentUserId);
  formData.append('deviceId', currentDeviceId);
  
  fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    body: formData,
    mode: 'no-cors'
  }).catch(err => {
    console.error('Service Worker: ผิดพลาดในการซิงค์ public alarm:', err);
  });
}

// จัดการกับการคลิก notification
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification ถูกคลิก', event.notification.tag);
  
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};
  
  // ปิด notification
  notification.close();
  
  // จัดการตาม action
  if (action === 'view' || action === '') {
    // เปิด/โฟกัสแอป
    event.waitUntil(
      self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      }).then((clientList) => {
        // ถ้ามี client เปิดอยู่แล้ว ให้โฟกัส
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus().then(() => {
              // ส่งข้อมูล alarm กลับไป
              client.postMessage({
                type: 'NOTIFICATION_CLICKED',
                data: data
              });
            });
          }
        }
        
        // ถ้าไม่มี client เปิดอยู่ ให้เปิดใหม่
        if (self.clients.openWindow) {
          return self.clients.openWindow('/').then((client) => {
            // รอให้หน้าโหลดเสร็จ
            setTimeout(() => {
              client.postMessage({
                type: 'NOTIFICATION_CLICKED',
                data: data
              });
            }, 1000);
          });
        }
      })
    );
  } else if (action === 'snooze') {
    // เลื่อน alarm
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SNOOZE_ALARM',
            alarmId: data.alarmId,
            minutes: action === 'snooze' ? 5 : 10
          });
        });
      })
    );
  } else if (action === 'dismiss') {
    // ปิด alarm
    console.log('Service Worker: ปิด alarm');
  }
});

// จัดการกับการปิด notification
self.addEventListener('notificationclose', (event) => {
  console.log('Service Worker: Notification ถูกปิด', event.notification.tag);
});

// Background Sync สำหรับ offline support
self.addEventListener('sync', (event) => {
  if (event.tag === 'check-alarms') {
    console.log('Service Worker: Background Sync - ตรวจสอบ alarms');
    event.waitUntil(checkAlarms());
  }
  
  if (event.tag === 'sync-data') {
    console.log('Service Worker: Background Sync - ซิงค์ข้อมูล');
    event.waitUntil(syncAlarmsWithServer());
  }
});

// ซิงค์ alarms กับเซิร์ฟเวอร์
function syncAlarmsWithServer() {
  if (!currentUserId) return Promise.resolve();
  
  const formData = new FormData();
  formData.append('action', 'sync_alarms');
  formData.append('userId', currentUserId);
  formData.append('deviceId', currentDeviceId);
  formData.append('alarms', JSON.stringify(alarms));
  
  return fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    body: formData,
    mode: 'no-cors'
  }).catch(err => {
    console.error('Service Worker: ผิดพลาดในการซิงค์:', err);
  });
}

// Push notifications
self.addEventListener('push', (event) => {
  console.log('Service Worker: ได้รับ push notification');
  
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = {
        title: 'การแจ้งเตือนใหม่',
        body: event.data.text() || 'มีแจ้งเตือนใหม่จากระบบ'
      };
    }
  }
  
  const options = {
    body: data.body || 'มีแจ้งเตือนใหม่',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [100, 50, 100],
    data: data.data || {},
    requireInteraction: true
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'ระบบแจ้งเตือน', options)
  );
});

// ตรวจสอบ alarms ทันทีที่ Service Worker ตื่น
self.addEventListener('activate', () => {
  // ส่ง periodic sync request ทุกๆ 30 นาที
  if ('periodicSync' in self.registration) {
    const periodicSyncOptions = {
      minInterval: 30 * 60 * 1000 // 30 นาที
    };
    
    self.registration.periodicSync.register('check-alarms', periodicSyncOptions)
      .then(() => {
        console.log('Service Worker: Periodic sync ลงทะเบียนสำเร็จ');
      })
      .catch(err => {
        console.error('Service Worker: ผิดพลาดในการลงทะเบียน periodic sync:', err);
      });
  }
});

// ตรวจสอบ alarms ตอนที่ได้รับ push
self.addEventListener('push', () => {
  // ตรวจสอบ alarms เพิ่มเติมเมื่อได้รับ push
  setTimeout(checkAlarms, 1000);
});

// Keep alive - ตรวจสอบ alarms ทุกนาทีเมื่อมีกิจกรรม
let lastActivity = Date.now();
setInterval(() => {
  const now = Date.now();
  if (now - lastActivity < 5 * 60 * 1000) { // ภายใน 5 นาทีที่ผ่านมา
    checkAlarms();
  }
}, 60000); // ทุก 1 นาที

// อัปเดตเวลากิจกรรมเมื่อมี message
self.addEventListener('message', () => {
  lastActivity = Date.now();
});
