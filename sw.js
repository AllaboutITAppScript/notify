// Service Worker สำหรับระบบแจ้งเตือนรวมศูนย์
const CACHE_NAME = 'notification-system-v2.0';

// ติดตั้ง Service Worker
self.addEventListener('install', (event) => {
    console.log('🛠️ Service Worker กำลังติดตั้ง...');
    self.skipWaiting();
});

// เปิดใช้งาน Service Worker
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker เปิดใช้งานแล้ว');
    event.waitUntil(self.clients.claim());
});

// รับข้อความจาก client
self.addEventListener('message', (event) => {
    console.log('📨 Service Worker รับข้อความ:', event.data);
});

// Background sync สำหรับการตรวจสอบแจ้งเตือน
self.addEventListener('sync', (event) => {
    console.log('🔄 Background sync:', event.tag);
});

// แสดงการแจ้งเตือน
self.addEventListener('push', (event) => {
    console.log('📢 Push event received');
    
    let data = {};
    if (event.data) {
        data = event.data.json();
    }
    
    const options = {
        body: data.body || 'การแจ้งเตือนใหม่',
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [100, 50, 100],
        data: {
            url: self.location.origin,
            time: Date.now()
        }
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'การแจ้งเตือน', options)
    );
});

// เมื่อมีการคลิกที่การแจ้งเตือน
self.addEventListener('notificationclick', (event) => {
    console.log('🔘 Notification clicked');
    
    event.notification.close();
    
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            if (clientList.length > 0) {
                let client = clientList[0];
                for (let i = 0; i < clientList.length; i++) {
                    if (clientList[i].focused) {
                        client = clientList[i];
                    }
                }
                return client.focus();
            }
            return self.clients.openWindow('/');
        })
    );
});

// Periodic sync สำหรับการตรวจสอบทุก 15 นาที
self.addEventListener('periodicsync', (event) => {
    console.log('🔄 Periodic sync:', event.tag);
});

// Fetch event สำหรับการทำงานออฟไลน์
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});
