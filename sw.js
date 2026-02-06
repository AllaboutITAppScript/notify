// Service Worker สำหรับระบบแจ้งเตือนรวมศูนย์
const CACHE_NAME = 'notification-system-v1.3.0';
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwpOYJ_pB6Llu9bd7RJABMd0awxu09oVFPB1cK4zsq3-aBYze5EpSHTSGgO1EcSJ3DwpQ/exec';

// แจ้งเตือนตัวเองเมื่อ Service Worker พร้อมใช้งาน
self.addEventListener('install', (event) => {
    console.log('✅ Service Worker: กำลังติดตั้ง...');
    self.skipWaiting();
    
    // Cache สำคัญ
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll([
                    '/',
                    '/index.html',
                    '/manifest.json'
                ]);
            })
    );
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
                            console.log('ลบ cache เก่า:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ]).then(() => {
            // แจ้งเตือนหน้าต่างหลักว่า Service Worker พร้อมแล้ว
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
            syncAlarms(event.data.alarms, event.data.userId, event.data.deviceId);
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

// ฟังก์ชันตั้งเวลาแจ้งเตือน
function scheduleAlarm(alarm) {
    console.log('⏰ Service Worker: ตั้งเวลาแจ้งเตือน:', alarm.title);
    
    // เก็บ alarm ใน IndexedDB
    storeAlarm(alarm);
    
    // ตั้งการตรวจสอบเป็นระยะ
    checkScheduledAlarms();
}

// ฟังก์ชันซิงค์ alarms
function syncAlarms(alarms, userId, deviceId) {
    console.log('🔄 Service Worker: ซิงค์ alarms:', alarms.length);
    
    // ล้าง alarms เก่า
    indexedDBDeleteAll('alarms').then(() => {
        // เก็บ alarms ใหม่
        alarms.forEach(alarm => {
            storeAlarm(alarm);
        });
    });
}

// ฟังก์ชันยกเลิก alarm
function cancelAlarm(alarmId) {
    console.log('❌ Service Worker: ยกเลิก alarm:', alarmId);
    indexedDBDelete('alarms', alarmId);
}

// ฟังก์ชันแจ้งเตือนทันที
function triggerAlarmNow(alarm, urgent = false) {
    console.log('🔔 Service Worker: แจ้งเตือนทันที:', alarm.title);
    
    const now = new Date();
    const alarmTime = new Date(alarm.datetime);
    
    // สร้างข้อความแจ้งเตือน
    const typeText = alarm.type === 'personal' ? ' (ส่วนตัว)' : ' (แจ้งทุกคน)';
    const title = alarm.title + typeText;
    const body = alarm.description || 'เวลาแจ้งเตือนถึงแล้ว!';
    
    // แสดงการแจ้งเตือน
    showNotification(title, body, urgent, {
        alarm: alarm,
        type: 'alarm_triggered',
        time: now.toISOString()
    });
    
    // ส่งไปยังแอปพลิเคชันหลัก
    sendMessageToApp({
        type: 'ALARM_TRIGGERED',
        alarm: alarm
    });
    
    // ถ้าเป็น alarm ตามเวลาจริง
    if (new Date(alarm.datetime) <= now) {
        // อัปเดตสถานะใน IndexedDB
        alarm.triggered = true;
        alarm.triggeredAt = now.toISOString();
        storeAlarm(alarm);
    }
}

// ฟังก์ชันส่งประกาศ
function sendBroadcastNow(broadcast) {
    console.log('📢 Service Worker: ส่งประกาศ:', broadcast.title);
    
    // แสดงการแจ้งเตือน
    showNotification(broadcast.title, broadcast.message, broadcast.urgent, {
        broadcast: broadcast,
        type: 'broadcast',
        time: new Date().toISOString()
    });
}

// ฟังก์ชันแสดงการแจ้งเตือน
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
    
    // ตั้งค่าเสียง
    if (urgent) {
        options.actions = [
            {
                action: 'view',
                title: 'ดู'
            },
            {
                action: 'dismiss',
                title: 'ปิด'
            }
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

// ตรวจสอบ alarms ที่ตั้งเวลาไว้
function checkScheduledAlarms() {
    console.log('🔍 Service Worker: กำลังตรวจสอบ alarms...');
    
    indexedDBGetAll('alarms').then(alarms => {
        const now = new Date();
        
        alarms.forEach(alarm => {
            if (!alarm.triggered && new Date(alarm.datetime) <= now) {
                triggerAlarmNow(alarm, alarm.priority === 'high');
            }
        });
    });
}

// ส่งข้อความกลับไปยังแอปพลิเคชันหลัก
function sendMessageToApp(message) {
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage(message);
        });
    });
}

// จัดการกับการคลิกแจ้งเตือน
self.addEventListener('notificationclick', (event) => {
    console.log('🔘 Service Worker: การแจ้งเตือนถูกคลิก');
    
    event.notification.close();
    
    const data = event.notification.data;
    
    // ส่งข้อมูลไปยังแอปพลิเคชันหลัก
    sendMessageToApp({
        type: 'NOTIFICATION_CLICKED',
        data: data
    });
    
    // เปิด/โฟกัสหน้าต่างแอปพลิเคชัน
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

// จัดการกับการปิดแจ้งเตือน
self.addEventListener('notificationclose', (event) => {
    console.log('❌ Service Worker: การแจ้งเตือนถูกปิด');
});

// ตั้งค่าการตรวจสอบ alarms ทุกนาที
setInterval(() => {
    checkScheduledAlarms();
}, 60000);

// เริ่มตรวจสอบทันทีที่ Service Worker ทำงาน
checkScheduledAlarms();

// ============================================
// IndexedDB Helper Functions
// ============================================
let db = null;

function openDatabase() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }
        
        const request = indexedDB.open('NotificationSystemDB', 1);
        
        request.onerror = (event) => {
            console.error('❌ Service Worker: IndexedDB error:', event.target.error);
            reject(event.target.error);
        };
        
        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // สร้าง object store สำหรับ alarms
            if (!db.objectStoreNames.contains('alarms')) {
                const store = db.createObjectStore('alarms', { keyPath: 'id' });
                store.createIndex('datetime', 'datetime', { unique: false });
                store.createIndex('triggered', 'triggered', { unique: false });
            }
            
            // สร้าง object store สำหรับ broadcasts
            if (!db.objectStoreNames.contains('broadcasts')) {
                db.createObjectStore('broadcasts', { keyPath: 'id' });
            }
        };
    });
}

function storeAlarm(alarm) {
    return new Promise((resolve, reject) => {
        openDatabase().then(db => {
            const transaction = db.transaction(['alarms'], 'readwrite');
            const store = transaction.objectStore('alarms');
            
            const request = store.put(alarm);
            
            request.onsuccess = () => {
                console.log('💾 Service Worker: บันทึก alarm เรียบร้อย:', alarm.id);
                resolve();
            };
            
            request.onerror = (event) => {
                console.error('❌ Service Worker: ไม่สามารถบันทึก alarm:', event.target.error);
                reject(event.target.error);
            };
        });
    });
}

function indexedDBGetAll(storeName) {
    return new Promise((resolve, reject) => {
        openDatabase().then(db => {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            
            request.onsuccess = (event) => {
                resolve(event.target.result || []);
            };
            
            request.onerror = (event) => {
                console.error(`❌ Service Worker: ไม่สามารถดึงข้อมูลจาก ${storeName}:`, event.target.error);
                reject(event.target.error);
            };
        });
    });
}

function indexedDBDelete(storeName, key) {
    return new Promise((resolve, reject) => {
        openDatabase().then(db => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            const request = store.delete(key);
            
            request.onsuccess = () => {
                console.log(`✅ Service Worker: ลบ ${key} จาก ${storeName} เรียบร้อย`);
                resolve();
            };
            
            request.onerror = (event) => {
                console.error(`❌ Service Worker: ไม่สามารถลบจาก ${storeName}:`, event.target.error);
                reject(event.target.error);
            };
        });
    });
}

function indexedDBDeleteAll(storeName) {
    return new Promise((resolve, reject) => {
        openDatabase().then(db => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            const request = store.clear();
            
            request.onsuccess = () => {
                console.log(`✅ Service Worker: ล้างทั้งหมดใน ${storeName} เรียบร้อย`);
                resolve();
            };
            
            request.onerror = (event) => {
                console.error(`❌ Service Worker: ไม่สามารถล้าง ${storeName}:`, event.target.error);
                reject(event.target.error);
            };
        });
    });
}

// ============================================
// Background Sync (ถ้ารองรับ)
// ============================================
self.addEventListener('sync', (event) => {
    console.log('🔄 Service Worker: Background Sync:', event.tag);
    
    if (event.tag === 'sync-alarms') {
        event.waitUntil(syncAlarmsWithServer());
    }
});

async function syncAlarmsWithServer() {
    try {
        const alarms = await indexedDBGetAll('alarms');
        const unsyncedAlarms = alarms.filter(alarm => !alarm.synced);
        
        for (const alarm of unsyncedAlarms) {
            // พยายามบันทึกลงเซิร์ฟเวอร์
            const saved = await saveAlarmToServer(alarm);
            if (saved) {
                alarm.synced = true;
                await storeAlarm(alarm);
            }
        }
    } catch (error) {
        console.error('❌ Service Worker: Sync กับเซิร์ฟเวอร์ล้มเหลว:', error);
    }
}

async function saveAlarmToServer(alarm) {
    try {
        const payload = {
            action: 'add_alarm',
            date: alarm.date,
            time: alarm.time,
            title: alarm.title,
            description: alarm.description || '',
            type: alarm.type,
            priority: alarm.priority,
            repeat: alarm.repeat,
            status: 'created',
            user_id: alarm.userId,
            user_name: alarm.userName,
            alarm_id: alarm.id,
            device_id: alarm.deviceId,
            timestamp: Date.now(),
            datetime: alarm.datetime
        };
        
        const params = new URLSearchParams();
        for (const key in payload) {
            if (payload[key] !== undefined && payload[key] !== null) {
                params.append(key, payload[key].toString());
            }
        }
        
        const url = `${GOOGLE_SCRIPT_URL}?${params.toString()}`;
        const response = await fetch(url, {
            method: 'GET',
            cache: 'no-cache'
        });
        
        return response.ok;
    } catch (error) {
        console.error('❌ Service Worker: ไม่สามารถบันทึกลงเซิร์ฟเวอร์:', error);
        return false;
    }
}
