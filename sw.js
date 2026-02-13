const CACHE_NAME = 'notification-system-v3.0';

self.addEventListener('install', (e) => {
    console.log('✅ Service Worker: ติดตั้ง');
    e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
    console.log('✅ Service Worker: เปิดใช้งาน');
    e.waitUntil(self.clients.claim());
});

self.addEventListener('message', (e) => {
    if (e.data.type === 'SCHEDULE_ALARM' && e.data.alarm) {
        const alarm = e.data.alarm;
        const delay = e.data.delay || 0;
        
        setTimeout(() => {
            self.registration.showNotification('🔔 ' + alarm.title + (alarm.type === 'public' ? ' (สาธารณะ)' : ' (ส่วนตัว)'), {
                body: alarm.description || 'ถึงเวลาแจ้งเตือนแล้ว!',
                icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ctext y=".9em" font-size="90"%3E🔔%3C/text%3E%3C/svg%3E',
                badge: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ctext y=".9em" font-size="90"%3E🔔%3C/text%3E%3C/svg%3E',
                tag: 'alarm_' + alarm.id,
                requireInteraction: alarm.priority === 'high',
                vibrate: alarm.vibrate ? [1000, 500, 1000] : undefined,
                data: { type: 'alarm', alarmId: alarm.id }
            });
            
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'ALARM_TRIGGERED', alarm: alarm });
                });
            });
        }, delay);
    }
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    e.waitUntil(self.clients.openWindow('/'));
});
