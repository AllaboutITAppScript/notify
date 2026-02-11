// sw.js
const CACHE_NAME = 'notification-system-v1.3';
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwpOYJ_pB6Llu9bd7RJABMd0awxu09oVFPB1cK4zsq3-aBYze5EpSHTSGgO1EcSJ3DwpQ/exec";

let alarms = [];
let userId = '';
let deviceId = '';

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
            alarms = event.data.alarms || [];
            userId = event.data.userId || '';
            deviceId = event.data.deviceId || '';
            console.log(`✅ Service Worker: บันทึก ${alarms.length} alarms`);
            
            // ตั้งเวลาแจ้งเตือนใหม่ทั้งหมด
            scheduleAlarms();
            break;
            
        case 'SCHEDULE_ALARM':
            const newAlarm = event.data.alarm;
            // ตรวจสอบว่ามี alarm นี้อยู่แล้วหรือไม่
            const exists = alarms.find(a => a.id === newAlarm.id);
            if (!exists) {
                alarms.push(newAlarm);
            }
            scheduleSingleAlarm(newAlarm);
            break;
            
        case 'CANCEL_ALARM':
            const alarmId = event.data.alarmId;
            alarms = alarms.filter(a => a.id !== alarmId);
            console.log(`❌ Service Worker: ลบ alarm ${alarmId}`);
            break;
            
        case 'SEND_BROADCAST':
            const broadcast = event.data.broadcast;
            triggerBroadcastNotification(broadcast);
            break;
            
        case 'TRIGGER_ALARM':
            const alarm = event.data.alarm;
            triggerAlarmNotification(alarm, event.data.urgent || false);
            break;
    }
});

// ตั้งเวลาแจ้งเตือนทั้งหมด
function scheduleAlarms() {
    console.log('⏰ Service Worker: กำลังตั้งเวลาแจ้งเตือน...');
    
    alarms.forEach(alarm => {
        if (!alarm.triggered) {
            scheduleSingleAlarm(alarm);
        }
    });
}

// ตั้งเวลาแจ้งเตือนเดียว
function scheduleSingleAlarm(alarm) {
    if (alarm.triggered) return;
    
    const alarmTime = new Date(alarm.datetime).getTime();
    const now = Date.now();
    
    if (alarmTime <= now) {
        // ถ้าเวลาผ่านไปแล้ว ให้แจ้งเตือนทันที
        triggerAlarmNotification(alarm, false);
        return;
    }
    
    const timeUntilAlarm = alarmTime - now;
    
    console.log(`⏰ Service Worker: ตั้งเวลา "${alarm.title}" ในอีก ${Math.round(timeUntilAlarm/1000)} วินาที`);
    
    // ใช้ setTimeout สำหรับการแจ้งเตือน
    setTimeout(() => {
        triggerAlarmNotification(alarm, true);
    }, timeUntilAlarm);
    
    // สำหรับแจ้งเตือนที่ทำซ้ำ
    if (alarm.repeat && alarm.repeat !== 'none') {
        scheduleRepeatAlarm(alarm);
    }
}

// ตั้งเวลาแจ้งเตือนทำซ้ำ
function scheduleRepeatAlarm(alarm) {
    const alarmDate = new Date(alarm.datetime);
    let nextDate;
    
    switch(alarm.repeat) {
        case 'daily':
            nextDate = new Date(alarmDate.getTime() + 24 * 60 * 60 * 1000);
            break;
        case 'weekly':
            nextDate = new Date(alarmDate.getTime() + 7 * 24 * 60 * 60 * 1000);
            break;
        case 'monthly':
            nextDate = new Date(alarmDate);
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
        default:
            return;
    }
    
    const newAlarm = {
        ...alarm,
        id: alarm.id + '_repeat_' + Date.now(),
        datetime: nextDate.toISOString(),
        triggered: false
    };
    
    setTimeout(() => {
        triggerAlarmNotification(newAlarm, true);
    }, nextDate.getTime() - Date.now());
}

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
            userId: userId,
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
            
            // ถ้าเป็นแจ้งเตือนสาธารณะ ให้อัปเดตสถานะในเซิร์ฟเวอร์
            if (alarm.type === 'public') {
                updateAlarmStatus(alarm.id);
            }
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

// อัปเดตสถานะแจ้งเตือนสาธารณะในเซิร์ฟเวอร์
async function updateAlarmStatus(alarmId) {
    try {
        const payload = {
            action: 'update_alarm',
            alarm_id: alarmId,
            status: 'triggered',
            triggered_at: new Date().toISOString(),
            timestamp: Date.now()
        };
        
        const params = new URLSearchParams();
        for (const key in payload) {
            params.append(key, payload[key]);
        }
        
        const url = `${GOOGLE_SCRIPT_URL}?${params.toString()}`;
        
        await fetch(url, {
            method: 'GET',
            cache: 'no-cache'
        });
        
        console.log('✅ Service Worker: อัปเดตสถานะแจ้งเตือนสาธารณะแล้ว');
    } catch (error) {
        console.error('❌ Service Worker: ไม่สามารถอัปเดตสถานะ:', error);
    }
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

// Background Sync สำหรับแจ้งเตือนสาธารณะ
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-public-alarms') {
        event.waitUntil(syncPublicAlarms());
    }
});

// ซิงค์แจ้งเตือนสาธารณะ
async function syncPublicAlarms() {
    try {
        const payload = {
            action: 'get_public_alarms',
            timestamp: Date.now()
        };
        
        const params = new URLSearchParams();
        for (const key in payload) {
            params.append(key, payload[key]);
        }
        
        const url = `${GOOGLE_SCRIPT_URL}?${params.toString()}`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.status === 'success' && result.alarms) {
            console.log('🔄 Service Worker: ได้รับแจ้งเตือนสาธารณะใหม่', result.alarms.length);
            
            // แจ้งไปยังหน้าหลัก
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'NEW_PUBLIC_ALARMS',
                        alarms: result.alarms
                    });
                });
            });
        }
    } catch (error) {
        console.error('❌ Service Worker: ซิงค์แจ้งเตือนสาธารณะล้มเหลว:', error);
    }
}

// ตรวจสอบแจ้งเตือนสาธารณะเป็นระยะๆ
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-public-alarms') {
        event.waitUntil(checkPublicAlarms());
    }
});

async function checkPublicAlarms() {
    try {
        const lastCheck = await getLastCheckTime();
        const now = Date.now();
        
        // ตรวจสอบทุก 5 นาที
        if (now - lastCheck > 5 * 60 * 1000) {
            await syncPublicAlarms();
            await saveLastCheckTime(now);
        }
    } catch (error) {
        console.error('❌ Service Worker: ตรวจสอบแจ้งเตือนสาธารณะล้มเหลว:', error);
    }
}

// ฟังก์ชันช่วยเหลือ
async function getLastCheckTime() {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match('last-check-time');
    if (response) {
        const text = await response.text();
        return parseInt(text) || 0;
    }
    return 0;
}

async function saveLastCheckTime(time) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put('last-check-time', new Response(time.toString()));
}
