// sw.js
const CACHE_NAME = 'notification-system-v2.0';

// ติดตั้ง Service Worker
self.addEventListener('install', (event) => {
    console.log('✅ Service Worker: กำลังติดตั้ง');
    event.waitUntil(self.skipWaiting());
});

// เปิดใช้งาน Service Worker
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker: เปิดใช้งานแล้ว');
    event.waitUntil(self.clients.claim());
    
    // แจ้งไปยังหน้าหลักว่า Service Worker พร้อมใช้งาน
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'SERVICE_WORKER_READY'
            });
        });
    });
});

// รับข้อความจากหน้าหลัก
self.addEventListener('message', (event) => {
    console.log('📨 Service Worker: ได้รับข้อความ', event.data.type);
    
    switch(event.data.type) {
        case 'SYNC_ALARMS':
            console.log(`✅ Service Worker: บันทึก ${event.data.alarms?.length || 0} alarms`);
            break;
            
        case 'SCHEDULE_ALARM':
            console.log('✅ Service Worker: ตั้งเวลาแจ้งเตือนใหม่', event.data.alarm.title);
            triggerAlarmNotification(event.data.alarm, false);
            break;
            
        case 'CANCEL_ALARM':
            console.log('❌ Service Worker: ลบ alarm', event.data.alarmId);
            break;
            
        case 'SEND_BROADCAST':
            console.log('📢 Service Worker: ส่งประกาศ', event.data.broadcast.title);
            triggerBroadcastNotification(event.data.broadcast);
            break;
            
        case 'TRIGGER_ALARM':
            console.log('🔔 Service Worker: แจ้งเตือนด่วน', event.data.alarm.title);
            triggerAlarmNotification(event.data.alarm, event.data.urgent || false);
            break;
    }
});

// แจ้งเตือนเมื่อถึงเวลา
function triggerAlarmNotification(alarm, urgent = false) {
    console.log('🔔 Service Worker: แจ้งเตือน!', alarm.title);
    
    const typeText = alarm.type === 'personal' ? ' (ส่วนตัว)' : ' (แจ้งทุกคน)';
    const title = alarm.title + typeText;
    const body = alarm.description || 'เวลาแจ้งเตือนถึงแล้ว!';
    
    // สร้างการแจ้งเตือน
    const options = {
        body: body,
        icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔔</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔔</text></svg>',
        tag: 'alarm_' + alarm.id,
        requireInteraction: urgent,
        data: {
            type: 'alarm',
            alarmId: alarm.id,
            alarmType: alarm.type,
            time: Date.now()
        }
    };
    
    // ตั้งค่าสำหรับแจ้งเตือนด่วน
    if (urgent || alarm.priority === 'high') {
        options.requireInteraction = true;
        options.vibrate = [1000, 500, 1000, 500, 1000];
        options.silent = false;
    } else {
        options.silent = true;
    }
    
    // แสดงการแจ้งเตือน
    self.registration.showNotification(title, options)
        .then(() => {
            console.log('✅ Service Worker: แสดงการแจ้งเตือนแล้ว');
            
            // แจ้งไปยังหน้าหลัก
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
        });
}

// แจ้งเตือนประกาศ
function triggerBroadcastNotification(broadcast) {
    console.log('📢 Service Worker: แสดงประกาศ', broadcast.title);
    
    const options = {
        body: broadcast.message,
        icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔔</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔔</text></svg>',
        tag: 'broadcast_' + broadcast.id,
        requireInteraction: broadcast.urgent,
        data: {
            type: 'broadcast',
            broadcastId: broadcast.id,
            urgent: broadcast.urgent,
            time: Date.now()
        }
    };
    
    if (broadcast.urgent) {
        options.requireInteraction = true;
        options.vibrate = [1000, 500, 1000, 500, 1000];
    }
    
    self.registration.showNotification(broadcast.title, options)
        .then(() => {
            console.log('✅ Service Worker: แสดงประกาศแล้ว');
        });
}

// เมื่อมีการคลิกที่การแจ้งเตือน
self.addEventListener('notificationclick', (event) => {
    console.log('🔘 Service Worker: คลิกการแจ้งเตือน', event.notification.data);
    
    event.notification.close();
    
    const data = event.notification.data;
    
    // แจ้งไปยังหน้าหลัก
    self.clients.matchAll().then(clients => {
        if (clients.length > 0) {
            clients[0].postMessage({
                type: 'NOTIFICATION_CLICKED',
                data: data
            });
            clients[0].focus();
        } else {
            self.clients.openWindow('/');
        }
    });
});
