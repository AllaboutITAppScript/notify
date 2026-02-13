// sw.js - Service Worker สำหรับระบบแจ้งเตือนรวมศูนย์
const CACHE_NAME = 'notification-system-v2.2';
const VERSION = '2.2.0';

// เก็บข้อมูลการแจ้งเตือนที่จะทำงานในเบื้องหลัง
let scheduledAlarms = new Map();
let activeTimeouts = new Map();

// ติดตั้ง Service Worker
self.addEventListener('install', (event) => {
    console.log('✅ Service Worker: กำลังติดตั้งเวอร์ชัน', VERSION);
    event.waitUntil(self.skipWaiting());
});

// เปิดใช้งาน Service Worker
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker: เปิดใช้งานแล้วเวอร์ชัน', VERSION);
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ ลบ Cache เก่า:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
    
    notifyClients({ type: 'SERVICE_WORKER_READY' });
    checkPendingAlarms();
});

// รับข้อความจากหน้าหลัก
self.addEventListener('message', (event) => {
    console.log('📨 Service Worker: ได้รับข้อความ', event.data?.type);
    
    switch(event.data?.type) {
        case 'SYNC_ALARMS':
            syncAlarms(event.data.alarms);
            break;
        case 'SCHEDULE_ALARM':
            scheduleAlarm(event.data.alarm, event.data.delay);
            break;
        case 'CANCEL_ALARM':
            cancelAlarm(event.data.alarmId);
            break;
        case 'SEND_BROADCAST':
            sendBroadcast(event.data.broadcast);
            break;
        case 'TRIGGER_ALARM':
            triggerAlarm(event.data.alarm, event.data.urgent || false);
            break;
    }
});

// จัดการเมื่อมีการคลิกที่การแจ้งเตือน
self.addEventListener('notificationclick', (event) => {
    console.log('🔘 Service Worker: คลิกการแจ้งเตือน', event.notification.tag);
    
    const notification = event.notification;
    const data = notification.data || {};
    
    notification.close();
    
    const urlToOpen = new URL('/', self.location.origin).href;
    
    event.waitUntil(
        self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            for (const client of clientList) {
                if (client.url === urlToOpen && 'focus' in client) {
                    client.postMessage({
                        type: 'NOTIFICATION_CLICKED',
                        data: data
                    });
                    return client.focus();
                }
            }
            return self.clients.openWindow(urlToOpen);
        })
    );
});

// ซิงค์การแจ้งเตือนจากหน้าหลัก
function syncAlarms(alarms = []) {
    console.log(`🔄 Service Worker: ซิงค์ ${alarms.length} การแจ้งเตือน`);
    
    scheduledAlarms.clear();
    
    activeTimeouts.forEach((timeoutId, alarmId) => {
        clearTimeout(timeoutId);
    });
    activeTimeouts.clear();
    
    alarms.forEach(alarm => {
        if (alarm && alarm.id && alarm.datetime) {
            scheduledAlarms.set(alarm.id, alarm);
            
            const alarmTime = new Date(alarm.datetime);
            const now = new Date();
            const delay = alarmTime.getTime() - now.getTime();
            
            if (delay > 0) {
                scheduleAlarm(alarm, delay);
            } else if (Math.abs(delay) < 1000) {
                triggerAlarm(alarm, true);
            }
        }
    });
    
    console.log(`✅ Service Worker: ซิงค์เสร็จสิ้น มี ${scheduledAlarms.size} การแจ้งเตือนรออยู่`);
}

// ตั้งเวลาการแจ้งเตือน
function scheduleAlarm(alarm, delay) {
    if (!alarm || !alarm.id || !delay || delay <= 0) {
        return;
    }
    
    console.log(`⏰ Service Worker: ตั้งเวลา "${alarm.title}" ในอีก ${Math.round(delay/1000)} วินาที`);
    
    if (activeTimeouts.has(alarm.id)) {
        clearTimeout(activeTimeouts.get(alarm.id));
        activeTimeouts.delete(alarm.id);
    }
    
    const timeoutId = setTimeout(() => {
        triggerAlarm(alarm, true);
        activeTimeouts.delete(alarm.id);
    }, delay);
    
    activeTimeouts.set(alarm.id, timeoutId);
    scheduledAlarms.set(alarm.id, alarm);
}

// ยกเลิกการแจ้งเตือน
function cancelAlarm(alarmId) {
    if (activeTimeouts.has(alarmId)) {
        clearTimeout(activeTimeouts.get(alarmId));
        activeTimeouts.delete(alarmId);
    }
    scheduledAlarms.delete(alarmId);
    console.log(`❌ Service Worker: ยกเลิกการแจ้งเตือน ${alarmId}`);
}

// แจ้งเตือนเมื่อถึงเวลา
function triggerAlarm(alarm, urgent = false) {
    console.log('🔔 Service Worker: แจ้งเตือน!', alarm?.title);
    
    if (!alarm) {
        console.error('❌ Service Worker: ไม่พบข้อมูลการแจ้งเตือน');
        return;
    }
    
    scheduledAlarms.delete(alarm.id);
    if (activeTimeouts.has(alarm.id)) {
        clearTimeout(activeTimeouts.get(alarm.id));
        activeTimeouts.delete(alarm.id);
    }
    
    const typeText = alarm.type === 'personal' ? ' (ส่วนตัว)' : ' (แจ้งทุกคน)';
    const title = alarm.title + typeText;
    const body = alarm.description || 'เวลาแจ้งเตือนถึงแล้ว!';
    
    const options = {
        body: body,
        icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ctext y=".9em" font-size="90"%3E🔔%3C/text%3E%3C/svg%3E',
        badge: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ctext y=".9em" font-size="90"%3E🔔%3C/text%3E%3C/svg%3E',
        tag: 'alarm_' + alarm.id + '_' + Date.now(),
        renotify: true,
        requireInteraction: urgent || alarm.priority === 'high' || true,
        silent: false,
        vibrate: alarm.vibrate ? [1000, 500, 1000, 500, 1000] : undefined,
        data: {
            type: 'alarm',
            alarmId: alarm.id,
            alarmType: alarm.type,
            title: alarm.title,
            time: Date.now(),
            urgent: urgent
        }
    };
    
    if (urgent || alarm.priority === 'high') {
        options.requireInteraction = true;
        options.vibrate = [1000, 500, 1000, 500, 1000];
        options.silent = false;
    }
    
    self.registration.showNotification(title, options)
        .then(() => {
            console.log('✅ Service Worker: แสดงการแจ้งเตือนแล้ว');
            
            notifyClients({
                type: 'ALARM_TRIGGERED',
                alarm: alarm
            });
        })
        .catch(error => {
            console.error('❌ Service Worker: ไม่สามารถแสดงการแจ้งเตือนได้:', error);
            
            self.registration.showNotification(title, {
                body: body,
                icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ctext y=".9em" font-size="90"%3E🔔%3C/text%3E%3C/svg%3E',
                badge: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ctext y=".9em" font-size="90"%3E🔔%3C/text%3E%3C/svg%3E',
                tag: 'alarm_' + alarm.id + '_' + Date.now(),
                data: { type: 'alarm', alarmId: alarm.id }
            }).catch(console.error);
        });
}

// ส่งประกาศ
function sendBroadcast(broadcast) {
    console.log('📢 Service Worker: ส่งประกาศ', broadcast?.title);
    
    if (!broadcast) return;
    
    const options = {
        body: broadcast.message,
        icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ctext y=".9em" font-size="90"%3E🔔%3C/text%3E%3C/svg%3E',
        badge: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ctext y=".9em" font-size="90"%3E🔔%3C/text%3E%3C/svg%3E',
        tag: 'broadcast_' + broadcast.id,
        renotify: true,
        requireInteraction: broadcast.urgent || false,
        vibrate: broadcast.urgent ? [1000, 500, 1000, 500, 1000] : [200, 100, 200],
        data: {
            type: 'broadcast',
            broadcastId: broadcast.id,
            urgent: broadcast.urgent,
            time: Date.now()
        }
    };
    
    self.registration.showNotification(broadcast.title, options)
        .then(() => {
            console.log('✅ Service Worker: แสดงประกาศแล้ว');
        })
        .catch(error => {
            console.error('❌ Service Worker: ไม่สามารถแสดงประกาศได้:', error);
        });
}

// ตรวจสอบการแจ้งเตือนที่ค้างอยู่
function checkPendingAlarms() {
    console.log('🔍 Service Worker: ตรวจสอบการแจ้งเตือนที่ค้างอยู่');
    
    if (scheduledAlarms.size > 0) {
        const pendingAlarms = Array.from(scheduledAlarms.values());
        notifyClients({
            type: 'PENDING_ALARMS',
            count: pendingAlarms.length,
            alarms: pendingAlarms
        });
    }
}

// แจ้งไปยังหน้าหลัก
function notifyClients(message) {
    self.clients.matchAll({
        includeUncontrolled: true,
        type: 'window'
    }).then(clients => {
        clients.forEach(client => {
            client.postMessage(message);
        });
    }).catch(error => {
        console.error('❌ Service Worker: ไม่สามารถแจ้งหน้าหลักได้:', error);
    });
}

// จัดการ fetch
self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('script.google.com')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});

console.log('🎉 Service Worker: พร้อมใช้งานเวอร์ชัน', VERSION);
