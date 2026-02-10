// Service Worker สำหรับระบบแจ้งเตือน
const CACHE_NAME = 'notification-system-v1.3';
const APP_NAME = 'ระบบแจ้งเตือนรวมศูนย์';

// ทรัพยากรที่ต้องแคช
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// ติดตั้ง Service Worker
self.addEventListener('install', event => {
  console.log('📦 Service Worker: กำลังติดตั้ง...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Service Worker: แคชทรัพยากร');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ Service Worker: ติดตั้งสำเร็จ');
        return self.skipWaiting();
      })
  );
});

// แอคทีฟและควบคุมคลายเอ็นต์
self.addEventListener('activate', event => {
  console.log('🔧 Service Worker: กำลังแอคทีฟ...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Service Worker: ลบแคชเก่า:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker: แอคทีฟสำเร็จ');
      return self.clients.claim();
    })
  );
});

// ดึงทรัพยากรจากแคช
self.addEventListener('fetch', event => {
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

// จัดการการส่งข้อความจากแอปพลิเคชัน
self.addEventListener('message', event => {
  console.log('📨 Service Worker: ได้รับข้อความ', event.data.type);
  
  switch (event.data.type) {
    case 'SCHEDULE_ALARM':
      scheduleAlarmNotification(event.data.alarm);
      break;
      
    case 'SYNC_ALARMS':
      syncAlarmsWithServiceWorker(event.data.alarms);
      break;
      
    case 'CANCEL_ALARM':
      cancelAlarm(event.data.alarmId);
      break;
      
    case 'SEND_BROADCAST':
      sendBroadcastNotification(event.data.broadcast);
      break;
      
    case 'TRIGGER_ALARM':
      triggerAlarmNotification(event.data.alarm, event.data.urgent);
      break;
  }
});

// ตัวแปรเก็บ alarms
let scheduledAlarms = [];

// ฟังก์ชันตั้งเวลาแจ้งเตือน
function scheduleAlarmNotification(alarm) {
  console.log('⏰ Service Worker: ตั้งเวลาแจ้งเตือน:', alarm.title);
  
  const alarmTime = new Date(alarm.datetime).getTime();
  const now = Date.now();
  const delay = alarmTime - now;
  
  if (delay > 0) {
    // ลบการแจ้งเตือนเก่าถ้ามี
    cancelAlarm(alarm.id);
    
    // ตั้งเวลาแจ้งเตือนใหม่
    const timeoutId = setTimeout(() => {
      triggerAlarmNotification(alarm, true);
    }, delay);
    
    // บันทึก alarm ไว้ในรายการ
    scheduledAlarms.push({
      id: alarm.id,
      timeoutId: timeoutId,
      alarm: alarm
    });
    
    console.log(`⏰ Service Worker: ตั้งเวลาแจ้งเตือนสำเร็จ (อีก ${Math.round(delay/1000)} วินาที)`);
  } else {
    console.log('⚠️ Service Worker: เวลาแจ้งเตือนผ่านไปแล้ว');
  }
}

// ฟังก์ชัน sync alarms
function syncAlarmsWithServiceWorker(alarms) {
  console.log('🔄 Service Worker: ซิงค์ alarms', alarms.length);
  
  // ลบ alarms เก่าทั้งหมด
  scheduledAlarms.forEach(scheduled => {
    clearTimeout(scheduled.timeoutId);
  });
  
  scheduledAlarms = [];
  
  // ตั้ง alarms ใหม่
  const now = Date.now();
  alarms.forEach(alarm => {
    if (!alarm.triggered) {
      const alarmTime = new Date(alarm.datetime).getTime();
      const delay = alarmTime - now;
      
      if (delay > 0) {
        const timeoutId = setTimeout(() => {
          triggerAlarmNotification(alarm, true);
        }, delay);
        
        scheduledAlarms.push({
          id: alarm.id,
          timeoutId: timeoutId,
          alarm: alarm
        });
      }
    }
  });
  
  console.log(`✅ Service Worker: ซิงค์ alarms สำเร็จ (${scheduledAlarms.length} alarms)`);
}

// ฟังก์ชันลบ alarm
function cancelAlarm(alarmId) {
  const alarmIndex = scheduledAlarms.findIndex(a => a.id === alarmId);
  
  if (alarmIndex !== -1) {
    clearTimeout(scheduledAlarms[alarmIndex].timeoutId);
    scheduledAlarms.splice(alarmIndex, 1);
    console.log(`❌ Service Worker: ลบ alarm ${alarmId} สำเร็จ`);
  }
}

// ฟังก์ชันแจ้งเตือนเมื่อถึงเวลา
function triggerAlarmNotification(alarm, urgent = false) {
  console.log('🔔 Service Worker: แจ้งเตือน!', alarm.title);
  
  // ส่งข้อความกลับไปยังแอป
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'ALARM_TRIGGERED',
        alarm: alarm
      });
    });
  });
  
  // สร้างการแจ้งเตือน
  const title = alarm.type === 'personal' ? `🔔 ${alarm.title}` : `📢 ${alarm.title}`;
  const options = {
    body: alarm.description || 'เวลาแจ้งเตือนถึงแล้ว!',
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    tag: `alarm_${alarm.id}`,
    requireInteraction: urgent,
    silent: false,
    vibrate: urgent ? [1000, 500, 1000, 500, 1000] : [200, 100, 200],
    timestamp: Date.now(),
    data: {
      alarmId: alarm.id,
      type: 'alarm',
      alarmType: alarm.type,
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
    ]
  };
  
  // เพิ่มปุ่มสำหรับแจ้งเตือนสาธารณะ
  if (alarm.type === 'public') {
    options.actions = [
      {
        action: 'view',
        title: 'ดูรายละเอียด'
      },
      {
        action: 'broadcast_info',
        title: 'ข้อมูลประกาศ'
      },
      {
        action: 'dismiss',
        title: 'ปิด'
      }
    ];
  }
  
  self.registration.showNotification(title, options)
    .then(() => {
      console.log('✅ Service Worker: แจ้งเตือนแสดงแล้ว');
      
      // ลบ alarm จากการติดตาม
      cancelAlarm(alarm.id);
    })
    .catch(error => {
      console.error('❌ Service Worker: ไม่สามารถแสดงการแจ้งเตือนได้:', error);
    });
}

// ฟังก์ชันส่งประกาศ
function sendBroadcastNotification(broadcast) {
  console.log('📢 Service Worker: ส่งประกาศ', broadcast.title);
  
  const options = {
    body: broadcast.message,
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    tag: `broadcast_${broadcast.id}`,
    requireInteraction: broadcast.urgent,
    silent: false,
    vibrate: broadcast.urgent ? [1000, 500, 1000, 500, 1000] : [200, 100, 200],
    timestamp: Date.now(),
    data: {
      broadcastId: broadcast.id,
      type: 'broadcast',
      urgent: broadcast.urgent,
      url: '/'
    },
    actions: [
      {
        action: 'view',
        title: 'ดูประกาศ'
      },
      {
        action: broadcast.urgent ? 'emergency_info' : 'broadcast_info',
        title: broadcast.urgent ? 'ข้อมูลด่วน' : 'ข้อมูลประกาศ'
      },
      {
        action: 'dismiss',
        title: 'ปิด'
      }
    ]
  };
  
  self.registration.showNotification(broadcast.title, options)
    .then(() => {
      console.log('✅ Service Worker: ประกาศแสดงแล้ว');
    })
    .catch(error => {
      console.error('❌ Service Worker: ไม่สามารถแสดงประกาศได้:', error);
    });
}

// จัดการเมื่อคลิกการแจ้งเตือน
self.addEventListener('notificationclick', event => {
  console.log('🔘 Service Worker: การแจ้งเตือนถูกคลิก', event.notification.tag);
  
  event.notification.close();
  
  const notificationData = event.notification.data || {};
  
  switch (event.action) {
    case 'view':
      // โฟกัสไปที่แอปและเปิดแผงการแจ้งเตือน
      event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then(clients => {
          if (clients.length > 0) {
            const client = clients[0];
            client.focus();
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              data: notificationData
            });
          } else {
            self.clients.openWindow('/');
          }
        })
      );
      break;
      
    case 'broadcast_info':
    case 'emergency_info':
    case 'alarm_info':
      // โฟกัสไปที่แอป
      event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then(clients => {
          if (clients.length > 0) {
            const client = clients[0];
            client.focus();
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              data: notificationData
            });
          } else {
            self.clients.openWindow('/');
          }
        })
      );
      break;
      
    case 'dismiss':
      // เพียงแค่ปิดการแจ้งเตือน
      console.log('❌ Service Worker: การแจ้งเตือนถูกปิด');
      break;
      
    default:
      // คลิกที่การแจ้งเตือนเอง (ไม่ใช่ปุ่ม)
      event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then(clients => {
          if (clients.length > 0) {
            const client = clients[0];
            client.focus();
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              data: notificationData
            });
          } else {
            self.clients.openWindow('/');
          }
        })
      );
  }
});

// ฟังก์ชันตรวจสอบ alarms ประจำ
function checkAlarmsPeriodically() {
  console.log('⏰ Service Worker: กำลังตรวจสอบ alarms...');
  
  const now = Date.now();
  
  scheduledAlarms.forEach(scheduled => {
    const alarmTime = new Date(scheduled.alarm.datetime).getTime();
    const timeDiff = alarmTime - now;
    
    // ถ้าเหลือน้อยกว่า 1 นาที ให้แสดงแจ้งเตือนล่วงหน้า
    if (timeDiff > 0 && timeDiff < 60000 && !scheduled.alarm.notifiedEarly) {
      console.log('⏰ Service Worker: แจ้งเตือนล่วงหน้า:', scheduled.alarm.title);
      
      const earlyTitle = `⏳ จะถึงเวลา: ${scheduled.alarm.title}`;
      const earlyOptions = {
        body: `อีก ${Math.round(timeDiff/1000)} วินาที จะถึงเวลาแจ้งเตือน`,
        icon: './icons/icon-192.png',
        tag: `early_${scheduled.alarm.id}`,
        silent: true
      };
      
      self.registration.showNotification(earlyTitle, earlyOptions);
      scheduled.alarm.notifiedEarly = true;
    }
  });
}

// ตรวจสอบ alarms ทุก 30 วินาที
setInterval(checkAlarmsPeriodically, 30000);

// แจ้งว่า Service Worker พร้อมใช้งานแล้ว
self.addEventListener('activate', event => {
  event.waitUntil(
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'SERVICE_WORKER_READY'
        });
      });
    })
  );
});

// Background Sync สำหรับการออนไลน์/ออฟไลน์
self.addEventListener('sync', event => {
  if (event.tag === 'sync-alarms') {
    console.log('🔄 Service Worker: Background Sync - ซิงค์ alarms');
    event.waitUntil(syncAlarmsInBackground());
  }
});

async function syncAlarmsInBackground() {
  // ดึงข้อมูล alarms จากเซิร์ฟเวอร์
  try {
    const response = await fetch('https://script.google.com/macros/s/AKfycbwpOYJ_pB6Llu9bd7RJABMd0awxu09oVFPB1cK4zsq3-aBYze5EpSHTSGgO1EcSJ3DwpQ/exec?action=get_public_alarms&timestamp=' + Date.now());
    const data = await response.json();
    
    if (data.status === 'success' && data.alarms) {
      console.log(`✅ Service Worker: Background Sync - พบ alarms ใหม่ ${data.alarms.length} รายการ`);
      
      // แจ้งเตือนแอปพลิเคชัน
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'BACKGROUND_SYNC_RESULT',
            alarms: data.alarms
          });
        });
      });
    }
  } catch (error) {
    console.error('❌ Service Worker: Background Sync ล้มเหลว:', error);
  }
}

// จัดการ Push Notifications
self.addEventListener('push', event => {
  console.log('📨 Service Worker: ได้รับ Push Notification');
  
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = {
      title: 'การแจ้งเตือนใหม่',
      body: event.data.text() || 'มีแจ้งเตือนใหม่ในระบบ',
      icon: './icons/icon-192.png'
    };
  }
  
  const options = {
    body: data.body || 'มีแจ้งเตือนใหม่ในระบบ',
    icon: data.icon || './icons/icon-192.png',
    badge: './icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      type: data.type || 'push'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'ระบบแจ้งเตือน', options)
  );
});
