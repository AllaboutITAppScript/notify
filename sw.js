// Service Worker สำหรับระบบแจ้งเตือนรวมศูนย์
const CACHE_NAME = 'notification-system-v1.3.0';

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
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'SERVICE_WORKER_READY'
                    });
                });
            });
        })
    );
});

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
    console.log('⏰ Service Worker: ตั้งเวลาแจ้งเตือน:', alarm.title);
    checkScheduledAlarms();
}

function syncAlarms(alarms) {
    console.log('🔄 Service Worker: ซิงค์ alarms:', alarms.length);
}

function cancelAlarm(alarmId) {
    console.log('❌ Service Worker: ยกเลิก alarm:', alarmId);
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
    
    sendMessageToApp({
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

function checkScheduledAlarms() {
    console.log('🔍 Service Worker: กำลังตรวจสอบ alarms...');
}

function sendMessageToApp(message) {
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
    
    sendMessageToApp({
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

setInterval(() => {
    checkScheduledAlarms();
}, 60000);

checkScheduledAlarms();
