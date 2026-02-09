// sw.js - Service Worker สำหรับระบบแจ้งเตือน
const VERSION = '1.4.0';
const CACHE_NAME = 'notification-system-v' + VERSION;

// สร้างฐานข้อมูลสำหรับแจ้งเตือน
const openDatabase = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('NotificationAlarmsDB', 1);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // สร้าง store สำหรับ alarms
            if (!db.objectStoreNames.contains('alarms')) {
                const alarmStore = db.createObjectStore('alarms', { keyPath: 'id' });
                alarmStore.createIndex('datetime', 'datetime', { unique: false });
                alarmStore.createIndex('triggered', 'triggered', { unique: false });
            }
            
            // สร้าง store สำหรับ notifications
            if (!db.objectStoreNames.contains('notifications')) {
                const notificationStore = db.createObjectStore('notifications', { keyPath: 'id' });
                notificationStore.createIndex('time', 'time', { unique: false });
            }
        };
        
        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
        
        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
};

// บันทึก alarms ลงใน IndexedDB
const saveAlarmsToDB = async (alarms) => {
    try {
        const db = await openDatabase();
        const transaction = db.transaction(['alarms'], 'readwrite');
        const store = transaction.objectStore('alarms');
        
        // ลบ alarms เก่าทั้งหมด
        await new Promise((resolve) => {
            const clearRequest = store.clear();
            clearRequest.onsuccess = () => resolve();
        });
        
        // เพิ่ม alarms ใหม่ทั้งหมด
        for (const alarm of alarms) {
            await new Promise((resolve, reject) => {
                const addRequest = store.add(alarm);
                addRequest.onsuccess = () => resolve();
                addRequest.onerror = (e) => reject(e);
            });
        }
        
        console.log(`✅ บันทึก ${alarms.length} alarms ลงใน IndexedDB แล้ว`);
        return true;
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดในการบันทึก alarms:', error);
        return false;
    }
};

// ดึง alarms จาก IndexedDB
const getAlarmsFromDB = async () => {
    try {
        const db = await openDatabase();
        const transaction = db.transaction(['alarms'], 'readonly');
        const store = transaction.objectStore('alarms');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e);
        });
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดในการดึง alarms:', error);
        return [];
    }
};

// แสดงการแจ้งเตือนจาก Service Worker
const showNotificationFromSW = (title, options) => {
    const notificationOptions = {
        body: options.body || 'การแจ้งเตือน',
        icon: options.icon || '/icon-192x192.png',
        badge: '/icon-72x72.png',
        tag: options.tag || 'notification',
        data: options.data || {},
        requireInteraction: options.requireInteraction || false,
        silent: options.silent || false,
        vibrate: options.vibrate || [200, 100, 200],
        actions: options.actions || []
    };
    
    return self.registration.showNotification(title, notificationOptions);
};

// ตรวจสอบและแจ้งเตือน alarms ที่ถึงเวลา
const checkAndTriggerAlarms = async () => {
    try {
        const alarms = await getAlarmsFromDB();
        const now = new Date();
        
        for (const alarm of alarms) {
            if (!alarm.triggered && new Date(alarm.datetime) <= now) {
                // อัปเดตสถานะ alarm
                alarm.triggered = true;
                alarm.triggeredAt = new Date().toISOString();
                
                // บันทึกสถานะที่อัปเดต
                await saveAlarm(alarm);
                
                // แสดงการแจ้งเตือน
                const title = alarm.type === 'public' ? `📢 ${alarm.title}` : `🔔 ${alarm.title}`;
                const body = alarm.description || 'เวลาแจ้งเตือนถึงแล้ว!';
                
                await showNotificationFromSW(title, {
                    body: body,
                    tag: `alarm_${alarm.id}`,
                    requireInteraction: true,
                    vibrate: alarm.vibrate ? [1000, 500, 1000, 500, 1000] : [200, 100, 200],
                    data: {
                        type: 'alarm',
                        alarmId: alarm.id,
                        alarmType: alarm.type,
                        url: self.location.origin
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
                });
                
                console.log(`🔔 Service Worker แจ้งเตือน: ${alarm.title}`);
                
                // ส่งข้อความกลับไปยังหน้าเว็บ
                const clients = await self.clients.matchAll();
                clients.forEach(client => {
                    client.postMessage({
                        type: 'ALARM_TRIGGERED',
                        alarm: alarm
                    });
                });
            }
        }
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดในการตรวจสอบ alarms:', error);
    }
};

// บันทึก alarm ใหม่
const saveAlarm = async (alarm) => {
    try {
        const db = await openDatabase();
        const transaction = db.transaction(['alarms'], 'readwrite');
        const store = transaction.objectStore('alarms');
        
        await new Promise((resolve, reject) => {
            const request = store.put(alarm);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
        
        return true;
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดในการบันทึก alarm:', error);
        return false;
    }
};

// ============================================
// Service Worker Events
// ============================================

// ตอนติดตั้ง Service Worker
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker กำลังติดตั้ง...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('✅ Cache ถูกสร้างแล้ว');
                return self.skipWaiting();
            })
    );
});

// ตอนเปิดใช้งาน Service Worker
self.addEventListener('activate', (event) => {
    console.log('🚀 Service Worker ถูกเปิดใช้งานแล้ว');
    
    event.waitUntil(
        Promise.all([
            // ล้าง cache เก่า
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            console.log(`🗑️ ลบ cache เก่า: ${cacheName}`);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            
            // ประกาศตัวกับ clients ทุกตัว
            self.clients.claim(),
            
            // แจ้งเตือนว่าพร้อมใช้งาน
            (async () => {
                const clients = await self.clients.matchAll();
                clients.forEach(client => {
                    client.postMessage({
                        type: 'SERVICE_WORKER_READY',
                        message: 'Service Worker พร้อมใช้งานแล้ว'
                    });
                });
            })()
        ])
    );
});

// รับข้อความจากหน้าเว็บ
self.addEventListener('message', (event) => {
    console.log('📨 ข้อความจากหน้าเว็บ:', event.data);
    
    const { type, data } = event.data;
    
    switch (type) {
        case 'SYNC_ALARMS':
            saveAlarmsToDB(data.alarms).then(() => {
                event.ports[0].postMessage({ success: true });
            });
            break;
            
        case 'SCHEDULE_ALARM':
            saveAlarm(data.alarm).then(() => {
                console.log(`✅ บันทึก alarm: ${data.alarm.title}`);
            });
            break;
            
        case 'CANCEL_ALARM':
            // ลบ alarm จาก IndexedDB
            (async () => {
                try {
                    const db = await openDatabase();
                    const transaction = db.transaction(['alarms'], 'readwrite');
                    const store = transaction.objectStore('alarms');
                    
                    await new Promise((resolve, reject) => {
                        const request = store.delete(data.alarmId);
                        request.onsuccess = () => resolve();
                        request.onerror = (e) => reject(e);
                    });
                    
                    console.log(`🗑️ ลบ alarm: ${data.alarmId}`);
                } catch (error) {
                    console.error('❌ เกิดข้อผิดพลาดในการลบ alarm:', error);
                }
            })();
            break;
            
        case 'SEND_BROADCAST':
            // แสดงการแจ้งเตือนประกาศ
            showNotificationFromSW(data.broadcast.title, {
                body: data.broadcast.message,
                tag: `broadcast_${Date.now()}`,
                requireInteraction: data.broadcast.urgent,
                vibrate: data.broadcast.urgent ? [1000, 500, 1000, 500, 1000] : [200, 100, 200],
                data: {
                    type: 'broadcast',
                    broadcastId: data.broadcast.id,
                    url: self.location.origin
                }
            });
            break;
            
        case 'TRIGGER_ALARM':
            // แสดงการแจ้งเตือนทันที
            showNotificationFromSW(`🔔 ${data.alarm.title}`, {
                body: data.alarm.description || 'การแจ้งเตือน',
                tag: `immediate_${data.alarm.id}`,
                requireInteraction: true,
                vibrate: data.alarm.vibrate ? [1000, 500, 1000, 500, 1000] : [200, 100, 200],
                data: {
                    type: 'alarm',
                    alarmId: data.alarm.id,
                    alarmType: data.alarm.type,
                    url: self.location.origin
                }
            });
            break;
    }
});

// จัดการกับการแจ้งเตือน
self.addEventListener('notificationclick', (event) => {
    console.log('🔘 Notification clicked:', event.notification.data);
    
    event.notification.close();
    
    const notificationData = event.notification.data || {};
    
    // เปิดหน้าเว็บเมื่อคลิกการแจ้งเตือน
    event.waitUntil(
        self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // ถ้ามีหน้าเว็บเปิดอยู่แล้ว ให้โฟกัสไปที่หน้าเว็บ
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.focus();
                    
                    // ส่งข้อมูลการคลิกกลับไปยังหน้าเว็บ
                    client.postMessage({
                        type: 'NOTIFICATION_CLICKED',
                        data: notificationData
                    });
                    
                    return;
                }
            }
            
            // ถ้าไม่มีหน้าเว็บเปิดอยู่ ให้เปิดหน้าใหม่
            if (self.clients.openWindow) {
                return self.clients.openWindow(notificationData.url || self.location.origin);
            }
        })
    );
});

// จัดการกับการกดปุ่มในการแจ้งเตือน
self.addEventListener('notificationclose', (event) => {
    console.log('❌ Notification closed:', event.notification.tag);
});

// Background Sync สำหรับตรวจสอบ alarms
self.addEventListener('sync', (event) => {
    if (event.tag === 'check-alarms') {
        console.log('🔄 Background Sync: กำลังตรวจสอบ alarms...');
        
        event.waitUntil(
            checkAndTriggerAlarms().then(() => {
                console.log('✅ Background Sync: ตรวจสอบ alarms เสร็จสิ้น');
            })
        );
    }
});

// Periodic Background Sync สำหรับแจ้งเตือนสาธารณะ
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-public-alarms') {
        console.log('🔄 Periodic Sync: กำลังตรวจสอบแจ้งเตือนสาธารณะ...');
        
        event.waitUntil(
            checkAndTriggerAlarms().then(() => {
                console.log('✅ Periodic Sync: ตรวจสอบแจ้งเตือนสาธารณะเสร็จสิ้น');
            })
        );
    }
});

// ตอนเริ่มต้น Service Worker
console.log('🎉 Service Worker โหลดสำเร็จแล้ว!');
