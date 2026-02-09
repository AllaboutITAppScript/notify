// service-worker.js
const CACHE_NAME = 'alarm-system-v2.0';
const urlsToCache = ['./'];

// Install event
self.addEventListener('install', event => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] Caching app shell');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event
self.addEventListener('activate', event => {
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event
self.addEventListener('fetch', event => {
    // ปล่อยให้ request ไปยัง Google Script ทำงานตามปกติ
    if (event.request.url.includes('script.google.com')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                return response || fetch(event.request);
            })
    );
});

// Push notification
self.addEventListener('push', event => {
    console.log('[Service Worker] Push notification received');
    
    let data = {};
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = { 
                title: 'การแจ้งเตือนใหม่', 
                body: event.data.text() || 'มีแจ้งเตือนใหม่จากระบบ'
            };
        }
    }
    
    const options = {
        body: data.body || 'มีแจ้งเตือนใหม่จากระบบ',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90" fill="%23667eea">🔔</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90" fill="%23667eea">🔔</text></svg>',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || './',
            id: data.id || Date.now()
        },
        actions: [
            {
                action: 'view',
                title: 'ดูรายละเอียด'
            },
            {
                action: 'close',
                title: 'ปิด'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'ระบบแจ้งเตือน', options)
    );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
    console.log('[Service Worker] Notification clicked:', event.action);
    
    event.notification.close();
    
    if (event.action === 'close') {
        return;
    }
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(clientList => {
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data.url || './');
            }
        })
    );
});

// Message handler จาก client
self.addEventListener('message', event => {
    console.log('[Service Worker] Message from client:', event.data);
    
    switch(event.data.type) {
        case 'SAVE_ALARMS':
            console.log('[Service Worker] Saving alarms for background');
            // บันทึก alarms สำหรับ background checking
            saveAlarmsForBackground(event.data.alarms);
            break;
            
        case 'TRIGGER_ALARM':
            console.log('[Service Worker] Triggering alarm:', event.data.alarm);
            // แสดง notification สำหรับ alarm
            self.registration.showNotification(
                event.data.alarm.title || 'แจ้งเตือน',
                {
                    body: event.data.alarm.description || 'ถึงเวลาแล้ว!',
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90" fill="%23667eea">🔔</text></svg>',
                    vibrate: [200, 100, 200, 100, 200],
                    tag: 'alarm-' + event.data.alarm.id,
                    requireInteraction: true,
                    data: {
                        alarmId: event.data.alarm.id
                    }
                }
            );
            break;
            
        case 'CHECK_ALARMS':
            console.log('[Service Worker] Checking alarms in background');
            checkAlarmsInBackground();
            break;
    }
});

// Background alarm checking
async function checkAlarmsInBackground() {
    console.log('[Service Worker] Checking alarms in background');
    try {
        const cache = await caches.open('alarms-data');
        const response = await cache.match('/alarms-data');
        
        if (response) {
            const alarms = await response.json();
            const now = new Date();
            
            alarms.forEach(alarm => {
                if (!alarm.triggered && new Date(alarm.datetime) <= now) {
                    // แสดง notification สำหรับ alarm ที่ถึงเวลา
                    self.registration.showNotification(
                        alarm.title || 'แจ้งเตือน',
                        {
                            body: alarm.description || 'ถึงเวลาแล้ว!',
                            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90" fill="%23667eea">🔔</text></svg>',
                            vibrate: [200, 100, 200, 100, 200],
                            tag: 'background-alarm-' + alarm.id,
                            requireInteraction: true,
                            data: {
                                alarmId: alarm.id
                            }
                        }
                    );
                }
            });
        }
    } catch (error) {
        console.error('[Service Worker] Error checking alarms:', error);
    }
}

// ฟังก์ชันช่วยเหลือ
async function saveAlarmsForBackground(alarms) {
    try {
        const cache = await caches.open('alarms-data');
        const response = new Response(JSON.stringify(alarms));
        await cache.put('/alarms-data', response);
        console.log('[Service Worker] Alarms saved for background checking');
    } catch (error) {
        console.error('[Service Worker] Error saving alarms:', error);
    }
}
