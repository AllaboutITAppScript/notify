// Service Worker สำหรับระบบแจ้งเตือนรวมศูนย์
const CACHE_NAME = 'notification-system-v1.4.0';

self.addEventListener('install', (event) => {
    console.log('✅ Service Worker: กำลังติดตั้ง...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker: พร้อมใช้งานแล้ว!');
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ]).then(() => {
            // แจ้งเตือนว่าพร้อมใช้งานแล้ว
            sendMessageToAllClients({
                type: 'SERVICE_WORKER_READY'
            });
        })
    );
});

// เก็บ alarms สำหรับการแจ้งเตือนเมื่อปิดแอป
let scheduledAlarms = [];

// รับข้อความจากแอปพลิเคชันหลัก
self.addEventListener('message', (event) => {
    console.log('📨 Service Worker: ได้รับข้อความ:', event.data.type);
    
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
            
        case 'TRIGGER_ALARM':
            triggerAlarmNow(event.data.alarm, event.data.urgent);
            break;
            
        case 'SEND_BROADCAST':
            sendBroadcastNow(event.data.broadcast);
            break;
    }
});

function scheduleAlarm(alarm) {
    console.log('⏰ Service Worker: ตั้งเวลาแจ้งเตือน:', alarm.title, alarm.datetime);
    
    // เก็บ alarm ในรายการ
    scheduledAlarms.push(alarm);
    
    // เริ่มตรวจสอบ alarms
    startAlarmChecker();
}

function syncAlarms(alarms) {
    console.log('🔄 Service Worker: ซิงค์ alarms:', alarms.length);
    scheduledAlarms = alarms.filter(alarm => !alarm.triggered);
    startAlarmChecker();
}

function cancelAlarm(alarmId) {
    console.log('❌ Service Worker: ยกเลิก alarm:', alarmId);
    scheduledAlarms = scheduledAlarms.filter(alarm => alarm.id !== alarmId);
}

function triggerAlarmNow(alarm, urgent = false) {
    console.log('🔔 Service Worker: แจ้งเตือนทันที:', alarm.title);
    
    const now = new Date();
    const typeText = alarm.type === 'personal' ? ' (ส่วนตัว)' : ' (แจ้งทุกคน)';
    const title = alarm.title + typeText;
    const body = alarm.description || 'เวลาแจ้งเตือนถึงแล้ว!';
    
    showNotification(title, body, urgent, {
        alarm: alarm,
        type: 'alarm_triggered',
        time: now.toISOString()
    });
    
    sendMessageToAllClients({
        type: 'ALARM_TRIGGERED',
        alarm: alarm
    });
}

function sendBroadcastNow(broadcast) {
    console.log('📢 Service Worker: ส่งประกาศ:', broadcast.title);
    
    showNotification(broadcast.title, broadcast.message, broadcast.urgent, {
        broadcast: broadcast,
        type: 'broadcast',
        time: new Date().toISOString()
    });
}

function showNotification(title, body, urgent = false, data = {}) {
    const options = {
        body: body,
        icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔔</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔔</text></svg>',
        tag: 'notification_' + Date.now(),
        requireInteraction: urgent,
        silent: false,
        vibrate: urgent ? [1000, 500, 1000, 500, 1000] : [200, 100, 200],
        data: {
            ...data,
            url: self.location.origin,
            timestamp: Date.now()
        }
    };
    
    if (urgent) {
        options.actions = [
            { action: 'view', title: 'ดู' },
            { action: 'dismiss', title: 'ปิด' }
        ];
    }
    
    self.registration.showNotification(title, options)
        .then(() => {
            console.log('✅ Service Worker: แสดงการแจ้งเตือนแล้ว');
        })
        .catch(err => {
            console.error('❌ Service Worker: ไม่สามารถแสดงการแจ้งเตือนได้:', err);
        });
}

// ฟังก์ชันตรวจสอบ alarms
let alarmCheckerInterval = null;

function startAlarmChecker() {
    if (alarmCheckerInterval) {
        clearInterval(alarmCheckerInterval);
    }
    
    alarmCheckerInterval = setInterval(() => {
        checkScheduledAlarms();
    }, 1000); // ตรวจสอบทุกวินาที
}

function checkScheduledAlarms() {
    const now = new Date();
    
    scheduledAlarms.forEach((alarm, index) => {
        const alarmTime = new Date(alarm.datetime);
        
        if (alarmTime <= now && !alarm.triggered) {
            console.log('🔔 Service Worker: ถึงเวลาแจ้งเตือน:', alarm.title);
            triggerAlarmNow(alarm, alarm.priority === 'high');
            
            // อัปเดตสถานะ
            scheduledAlarms[index].triggered = true;
            
            // ถ้ามีการทำซ้ำ
            if (alarm.repeat !== 'none') {
                scheduleNextRepeat(alarm);
            }
        }
    });
    
    // ลบ alarms ที่ triggered แล้ว
    scheduledAlarms = scheduledAlarms.filter(alarm => !alarm.triggered);
}

function scheduleNextRepeat(alarm) {
    const alarmDate = new Date(alarm.datetime);
    
    switch (alarm.repeat) {
        case 'daily':
            alarmDate.setDate(alarmDate.getDate() + 1);
            break;
        case 'weekly':
            alarmDate.setDate(alarmDate.getDate() + 7);
            break;
        case 'monthly':
            alarmDate.setMonth(alarmDate.getMonth() + 1);
            break;
    }
    
    const newAlarm = {
        ...alarm,
        id: 'alarm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        datetime: alarmDate.toISOString(),
        triggered: false
    };
    
    scheduledAlarms.push(newAlarm);
    console.log('🔄 Service Worker: สร้างแจ้งเตือนทำซ้ำใหม่:', newAlarm.title);
}

function sendMessageToAllClients(message) {
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage(message);
        });
    });
}

self.addEventListener('notificationclick', (event) => {
    console.log('🔘 Service Worker: การแจ้งเตือนถูกคลิก');
    
    event.notification.close();
    
    const data = event.notification.data;
    
    sendMessageToAllClients({
        type: 'NOTIFICATION_CLICKED',
        data: data
    });
    
    event.waitUntil(
        self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            if (clientList.length > 0) {
                const client = clientList[0];
                if ('focus' in client) {
                    return client.focus();
                }
            }
            return self.clients.openWindow(self.location.origin);
        })
    );
});

self.addEventListener('notificationclose', (event) => {
    console.log('❌ Service Worker: การแจ้งเตือนถูกปิด');
});

// เริ่มตรวจสอบ alarms ทันที
startAlarmChecker();

// Background Sync สำหรับแจ้งเตือนเมื่อออนไลน์
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-alarms') {
        event.waitUntil(checkScheduledAlarms());
    }
});

// Push event สำหรับรับแจ้งเตือนจากเซิร์ฟเวอร์
self.addEventListener('push', (event) => {
    let data = {};
    
    if (event.data) {
        data = event.data.json();
    }
    
    const title = data.title || 'การแจ้งเตือนใหม่';
    const body = data.body || 'คุณมีการแจ้งเตือนใหม่';
    
    showNotification(title, body, data.urgent || false, data);
});
