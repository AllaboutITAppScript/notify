// sw.js - Service Worker สำหรับระบบแจ้งเตือน
const VERSION = '1.5.0';
const CACHE_NAME = 'notification-system-v' + VERSION;

// ============================================
// IndexedDB สำหรับเก็บ alarms
// ============================================
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
                alarmStore.createIndex('userId', 'userId', { unique: false });
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
        
        // ลบ alarms เก่าของผู้ใช้นี้
        const allAlarms = await new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e);
        });
        
        // ลบเฉพาะ alarms ของผู้ใช้นี้
        for (const alarm of allAlarms) {
            if (alarm.userId === alarms[0]?.userId) {
                await new Promise((resolve, reject) => {
                    const deleteRequest = store.delete(alarm.id);
                    deleteRequest.onsuccess = () => resolve();
                    deleteRequest.onerror = (e) => reject(e);
                });
            }
        }
        
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

// แสดงการแจ้งเตือน
const showNotificationFromSW = (title, options) => {
    const notificationOptions = {
        body: options.body || 'การแจ้งเตือน',
        icon: '/icon-192x192.png',
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
        console.log('🔄 Service Worker: กำลังตรวจสอบ alarms...');
        const alarms = await getAlarmsFromDB();
        const now = new Date();
        
        console.log(`🔍 พบ alarms ${alarms.length} รายการ`);
        
        for (const alarm of alarms) {
            if (!alarm.triggered && new Date(alarm.datetime) <= now) {
                console.log(`🔔 แจ้งเตือนถึงเวลา: ${alarm.title}`);
                
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
                        userId: alarm.userId,
                        userName: alarm.userName,
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
                
                console.log(`✅ แสดงการแจ้งเตือน: ${alarm.title}`);
                
                // ส่งข้อความกลับไปยังหน้าเว็บ (ถ้าเปิดอยู่)
                const clients = await self.clients.matchAll();
                clients.forEach(client => {
                    client.postMessage({
                        type: 'ALARM_TRIGGERED',
                        alarm: alarm,
                        timestamp: Date.now()
                    });
                });
                
                // อัปเดตสถานะใน Google Sheets ถ้าเป็น public alarm
                if (alarm.type === 'public' && alarm.synced) {
                    try {
                        await updateAlarmInGoogleSheets(alarm.id);
                    } catch (error) {
                        console.error('❌ ไม่สามารถอัปเดตสถานะใน Google Sheets:', error);
                    }
                }
            }
        }
        
        console.log('✅ Service Worker: ตรวจสอบ alarms เสร็จสิ้น');
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดในการตรวจสอบ alarms:', error);
    }
};

// บันทึก alarm เดียว
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

// อัปเดตสถานะ alarm ใน Google Sheets
const updateAlarmInGoogleSheets = async (alarmId) => {
    try {
        const response = await fetch(`https://script.google.com/macros/s/AKfycbwpOYJ_pB6Llu9bd7RJABMd0awxu09oVFPB1cK4zsq3-aBYze5EpSHTSGgO1EcSJ3DwpQ/exec?action=update_alarm&alarm_id=${alarmId}&status=triggered&timestamp=${Date.now()}`);
        return response.ok;
    } catch (error) {
        throw error;
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
                return cache.addAll([
                    '/',
                    '/index.html',
                    '/manifest.json'
                ]);
            })
            .then(() => self.skipWaiting())
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
                        message: 'Service Worker พร้อมใช้งานแล้ว',
                        timestamp: Date.now()
                    });
                });
            })(),
            
            // เริ่มต้น Background Sync
            (async () => {
                try {
                    const registration = await self.registration;
                    await registration.sync.register('check-alarms');
                    console.log('✅ Background Sync ลงทะเบียนสำเร็จ');
                } catch (error) {
                    console.log('⚠️ Background Sync ไม่รองรับ:', error);
                }
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
                if (event.ports && event.ports[0]) {
                    event.ports[0].postMessage({ success: true });
                }
                console.log(`✅ บันทึก alarms ของ ${data.userId} เรียบร้อย`);
            }).catch(error => {
                console.error('❌ เกิดข้อผิดพลาดในการบันทึก alarms:', error);
            });
            break;
            
        case 'SCHEDULE_ALARM':
            saveAlarm(data.alarm).then(() => {
                console.log(`✅ บันทึก alarm: ${data.alarm.title}`);
            });
            break;
            
        case 'CANCEL_ALARM':
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
                    sender: data.broadcast.senderName,
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
            
        case 'CHECK_ALARMS':
            // ตรวจสอบ alarms ทันที
            checkAndTriggerAlarms();
            break;
    }
});

// จัดการกับการแจ้งเตือน
self.addEventListener('notificationclick', (event) => {
    console.log('🔘 Notification clicked:', event.notification.data);
    
    event.notification.close();
    
    const notificationData = event.notification.data || {};
    const action = event.action;
    
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
                        data: notificationData,
                        action: action,
                        timestamp: Date.now()
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
    
    if (event.tag === 'sync-public-alarms') {
        console.log('🔄 Periodic Sync: กำลังซิงค์แจ้งเตือนสาธารณะจากเซิร์ฟเวอร์...');
        
        event.waitUntil(
            fetchPublicAlarmsFromServer()
        );
    }
});

// ดึงแจ้งเตือนสาธารณะจากเซิร์ฟเวอร์
const fetchPublicAlarmsFromServer = async () => {
    try {
        const response = await fetch(`https://script.google.com/macros/s/AKfycbwpOYJ_pB6Llu9bd7RJABMd0awxu09oVFPB1cK4zsq3-aBYze5EpSHTSGgO1EcSJ3DwpQ/exec?action=get_public_alarms&timestamp=${Date.now()}`);
        const result = await response.json();
        
        if (result.status === 'success' && result.alarms) {
            console.log(`📡 ดึงแจ้งเตือนสาธารณะ ${result.alarms.length} รายการจากเซิร์ฟเวอร์`);
            
            // บันทึก alarms สาธารณะลงใน IndexedDB
            const publicAlarms = result.alarms.map(alarm => ({
                ...alarm,
                type: 'public',
                isExternal: true
            }));
            
            await saveAlarmsToDB(publicAlarms);
            
            // แจ้งเตือนไปยัง clients ที่เปิดอยู่
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
                client.postMessage({
                    type: 'NEW_PUBLIC_ALARMS',
                    alarms: publicAlarms,
                    count: publicAlarms.length,
                    timestamp: Date.now()
                });
            });
        }
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดในการดึงแจ้งเตือนสาธารณะ:', error);
    }
};

// ตั้งค่า interval สำหรับตรวจสอบ alarms ทุก 1 นาที
setInterval(() => {
    checkAndTriggerAlarms();
}, 60000); // ทุก 1 นาที

// ตอนเริ่มต้น Service Worker
console.log('🎉 Service Worker โหลดสำเร็จแล้ว! เวอร์ชัน', VERSION);

// ตรวจสอบ alarms ทันทีเมื่อโหลด
setTimeout(() => {
    checkAndTriggerAlarms();
}, 5000);
