// Service Worker สำหรับแจ้งเตือนเมื่อล็อคจอ
const CACHE_NAME = 'notification-system-v2';
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwpOYJ_pB6Llu9bd7RJABMd0awxu09oVFPB1cK4zsq3-aBYze5EpSHTSGgO1EcSJ3DwpQ/exec";

// ติดตั้ง Service Worker
self.addEventListener('install', (event) => {
    console.log('✅ Service Worker ติดตั้งแล้ว');
    event.waitUntil(self.skipWaiting());
});

// เปิดใช้งาน Service Worker
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker เปิดใช้งานแล้ว');
    event.waitUntil(self.clients.claim());
});

// รับข้อความจากหน้าหลัก
self.addEventListener('message', async (event) => {
    console.log('📨 ข้อความจากหน้าหลัก:', event.data);
    
    const data = event.data;
    
    switch(data.type) {
        case 'SYNC_ALARMS':
            // บันทึก alarms ใน Service Worker
            const alarms = data.alarms || [];
            console.log(`📋 บันทึก ${alarms.length} alarms ใน Service Worker`);
            
            // ตั้งเวลาตรวจสอบ
            setupAlarmChecking(alarms, data.userId, data.deviceId);
            break;
            
        case 'SCHEDULE_ALARM':
            // เพิ่ม alarm ใหม่
            console.log('⏰ เพิ่ม alarm ใหม่ใน Service Worker:', data.alarm.title);
            
            // ดึง alarms ที่มีอยู่
            const existingAlarms = await getStoredAlarms();
            existingAlarms.push(data.alarm);
            
            // บันทึกและตั้งเวลาตรวจสอบใหม่
            await storeAlarms(existingAlarms);
            setupAlarmChecking(existingAlarms, data.alarm.userId, data.alarm.deviceId);
            break;
            
        case 'TRIGGER_ALARM':
            // แจ้งเตือน alarm ทันที
            console.log('🔔 แจ้งเตือน alarm จากหน้าหลัก:', data.alarm.title);
            triggerNotificationImmediately(data.alarm);
            break;
            
        case 'CANCEL_ALARM':
            // ลบ alarm
            console.log('🗑️ ลบ alarm จาก Service Worker:', data.alarmId);
            await cancelAlarm(data.alarmId);
            break;
            
        case 'SEND_BROADCAST':
            // ส่งประกาศ
            console.log('📢 ส่งประกาศ:', data.broadcast.title);
            triggerBroadcastNotification(data.broadcast);
            break;
    }
});

// ตั้งค่าการตรวจสอบ alarms
function setupAlarmChecking(alarms, userId, deviceId) {
    // ล้าง interval เดิม
    if (self.alarmCheckInterval) {
        clearInterval(self.alarmCheckInterval);
    }
    
    // ตั้ง interval ตรวจสอบทุก 1 นาที
    self.alarmCheckInterval = setInterval(async () => {
        await checkAndTriggerAlarms(alarms, userId, deviceId);
    }, 60000); // ตรวจสอบทุก 1 นาที
    
    console.log('⏱️ ตั้งระบบตรวจสอบ alarms ในพื้นหลัง');
}

// ตรวจสอบและแจ้งเตือน alarms
async function checkAndTriggerAlarms(alarms, userId, deviceId) {
    const now = new Date();
    console.log('🔍 ตรวจสอบ alarms ในพื้นหลัง เวลา:', now.toLocaleTimeString());
    
    // ดึง alarms จาก storage
    const storedAlarms = await getStoredAlarms();
    const activeAlarms = storedAlarms.filter(alarm => !alarm.triggered);
    
    let triggeredCount = 0;
    
    for (const alarm of activeAlarms) {
        const alarmTime = new Date(alarm.datetime);
        
        // ถ้าเวลาถึงแล้ว ให้แจ้งเตือน
        if (alarmTime <= now) {
            console.log('⏰ เวลาแจ้งเตือนถึงแล้ว:', alarm.title);
            
            // แจ้งเตือน
            await triggerNotification(alarm, userId, deviceId);
            
            // อัปเดตสถานะ
            alarm.triggered = true;
            alarm.triggeredAt = new Date().toISOString();
            triggeredCount++;
        }
    }
    
    if (triggeredCount > 0) {
        // บันทึก alarms ที่อัปเดตแล้ว
        await storeAlarms(storedAlarms);
        console.log(`✅ แจ้งเตือน ${triggeredCount} รายการ`);
        
        // แจ้งไปยังหน้าหลัก
        notifyMainPage('ALARMS_TRIGGERED', { count: triggeredCount });
    }
}

// แจ้งเตือน
async function triggerNotification(alarm, userId, deviceId) {
    const title = `${alarm.type === 'public' ? '📢 ' : '⏰ '}${alarm.title}`;
    const options = {
        body: alarm.description || 'เวลาแจ้งเตือนถึงแล้ว!',
        icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔔</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔔</text></svg>',
        tag: `alarm_${alarm.id}`,
        requireInteraction: true,
        data: {
            alarmId: alarm.id,
            type: 'alarm',
            userId: userId,
            deviceId: deviceId,
            alarmType: alarm.type
        },
        vibrate: [1000, 500, 1000, 500, 1000],
        silent: false
    };
    
    // แสดงการแจ้งเตือน
    await self.registration.showNotification(title, options);
    
    // ส่งไปยัง Google Sheets ถ้าเป็นแจ้งเตือนสาธารณะ
    if (alarm.type === 'public') {
        await updateAlarmStatusInSheets(alarm.id, 'triggered', userId, deviceId);
    }
    
    // แจ้งไปยังหน้าหลัก
    notifyMainPage('ALARM_TRIGGERED', { alarm: alarm });
}

// แจ้งเตือนทันที
async function triggerNotificationImmediately(alarm) {
    const title = `${alarm.type === 'public' ? '📢 ' : '⏰ '}${alarm.title}`;
    const options = {
        body: alarm.description || 'การแจ้งเตือน!',
        icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔔</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔔</text></svg>',
        tag: `alarm_${Date.now()}`,
        requireInteraction: true,
        data: {
            alarmId: alarm.id,
            type: 'alarm',
            userId: alarm.userId,
            deviceId: alarm.deviceId,
            alarmType: alarm.type
        },
        vibrate: [1000, 500, 1000, 500, 1000],
        silent: false
    };
    
    await self.registration.showNotification(title, options);
}

// แจ้งเตือนประกาศ
async function triggerBroadcastNotification(broadcast) {
    const options = {
        body: broadcast.message,
        icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔔</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔔</text></svg>',
        tag: `broadcast_${broadcast.id}`,
        requireInteraction: broadcast.urgent,
        data: {
            id: broadcast.id,
            type: 'broadcast',
            title: broadcast.title,
            message: broadcast.message,
            urgent: broadcast.urgent
        },
        vibrate: broadcast.urgent ? [1000, 500, 1000, 500, 1000] : [200, 100, 200],
        silent: false
    };
    
    await self.registration.showNotification(broadcast.title, options);
}

// เมื่อมีการคลิกการแจ้งเตือน
self.addEventListener('notificationclick', (event) => {
    console.log('🔘 คลิกการแจ้งเตือน:', event.notification.data);
    
    event.notification.close();
    
    // เปิดหน้าต่าง/แท็บ
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // ถ้ามีหน้าต่างอยู่แล้ว ให้โฟกัส
                for (const client of clientList) {
                    if (client.url === self.location.origin + '/' && 'focus' in client) {
                        return client.focus();
                    }
                }
                
                // ถ้าไม่มีหน้าต่าง ให้เปิดใหม่
                if (self.clients.openWindow) {
                    return self.clients.openWindow('/');
                }
            })
    );
    
    // แจ้งไปยังหน้าหลัก
    notifyMainPage('NOTIFICATION_CLICKED', { data: event.notification.data });
});

// อัปเดตสถานะ alarm ใน Google Sheets
async function updateAlarmStatusInSheets(alarmId, status, userId, deviceId) {
    try {
        const payload = {
            action: 'update_alarm',
            alarm_id: alarmId,
            status: status,
            triggered_at: new Date().toISOString(),
            user_id: userId,
            device_id: deviceId,
            timestamp: Date.now()
        };
        
        const params = new URLSearchParams();
        for (const key in payload) {
            if (payload[key] !== undefined && payload[key] !== null) {
                params.append(key, payload[key].toString());
            }
        }
        
        const url = `${GOOGLE_SCRIPT_URL}?${params.toString()}`;
        await fetch(url, { 
            method: 'GET',
            cache: 'no-cache'
        });
        
        console.log('✅ อัปเดตสถานะ alarm ใน Google Sheets');
    } catch (error) {
        console.error('❌ ไม่สามารถอัปเดตสถานะ alarm:', error);
    }
}

// แจ้งไปยังหน้าหลัก
function notifyMainPage(type, data) {
    self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
            client.postMessage({
                type: type,
                ...data
            });
        });
    });
}

// ดึง alarms จาก storage
async function getStoredAlarms() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const response = await cache.match('alarms');
        
        if (response) {
            const data = await response.json();
            return data.alarms || [];
        }
    } catch (error) {
        console.log('❌ ไม่สามารถดึง alarms จาก cache:', error);
    }
    
    return [];
}

// บันทึก alarms ใน storage
async function storeAlarms(alarms) {
    try {
        const cache = await caches.open(CACHE_NAME);
        const response = new Response(JSON.stringify({ alarms: alarms }), {
            headers: { 'Content-Type': 'application/json' }
        });
        
        await cache.put('alarms', response);
        console.log(`💾 บันทึก ${alarms.length} alarms ใน cache`);
    } catch (error) {
        console.log('❌ ไม่สามารถบันทึก alarms ใน cache:', error);
    }
}

// ลบ alarm
async function cancelAlarm(alarmId) {
    const storedAlarms = await getStoredAlarms();
    const updatedAlarms = storedAlarms.filter(alarm => alarm.id !== alarmId);
    await storeAlarms(updatedAlarms);
    
    // ตั้งเวลาตรวจสอบใหม่
    setupAlarmChecking(updatedAlarms);
}

// ตั้งค่า Background Sync (ถ้ารองรับ)
if ('sync' in self.registration) {
    self.addEventListener('sync', (event) => {
        if (event.tag === 'sync-alarms') {
            console.log('🔄 Background Sync ทำงาน');
            event.waitUntil(syncAlarmsWithServer());
        }
    });
}

// ซิงค์ alarms กับเซิร์ฟเวอร์
async function syncAlarmsWithServer() {
    try {
        // ดึง alarms จาก storage
        const storedAlarms = await getStoredAlarms();
        const pendingAlarms = storedAlarms.filter(alarm => !alarm.synced);
        
        console.log(`🔄 ซิงค์ ${pendingAlarms.length} alarms กับเซิร์ฟเวอร์`);
        
        // TODO: ซิงค์กับเซิร์ฟเวอร์
    } catch (error) {
        console.error('❌ ซิงค์ alarms ล้มเหลว:', error);
    }
}

// ตั้งค่า Periodic Background Sync (ถ้ารองรับ)
if ('periodicSync' in self.registration) {
    self.addEventListener('periodicSync', (event) => {
        if (event.tag === 'check-public-alarms') {
            console.log('🔄 Periodic Background Sync ทำงาน');
            event.waitUntil(checkForPublicAlarmsInBackground());
        }
    });
}

// ตรวจสอบแจ้งเตือนสาธารณะในพื้นหลัง
async function checkForPublicAlarmsInBackground() {
    try {
        console.log('🔍 ตรวจสอบแจ้งเตือนสาธารณะในพื้นหลัง');
        
        // TODO: ตรวจสอบแจ้งเตือนสาธารณะใหม่จากเซิร์ฟเวอร์
    } catch (error) {
        console.error('❌ ตรวจสอบแจ้งเตือนสาธารณะล้มเหลว:', error);
    }
}

// แจ้งเตือนว่า Service Worker พร้อมใช้งาน
self.addEventListener('activate', (event) => {
    event.waitUntil(
        self.clients.matchAll().then((clients) => {
            clients.forEach((client) => {
                client.postMessage({
                    type: 'SERVICE_WORKER_READY',
                    message: 'Service Worker พร้อมแจ้งเตือนในพื้นหลัง'
                });
            });
        })
    );
});

console.log('🎉 Service Worker โหลดเสร็จแล้ว พร้อมแจ้งเตือนเมื่อล็อคจอ!');
