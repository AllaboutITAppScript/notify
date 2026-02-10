// Service Worker สำหรับระบบแจ้งเตือน
const CACHE_NAME = 'notification-system-v2.1';

// ติดตั้ง Service Worker
self.addEventListener('install', event => {
  self.skipWaiting();
});

// แอคทีฟ Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    self.clients.claim()
  );
});

// จัดการ Push Notifications
self.addEventListener('push', event => {
  let data = {};
  
  try {
    if (event.data) {
      data = event.data.json();
    } else {
      data = {
        title: 'การแจ้งเตือนใหม่',
        body: 'มีแจ้งเตือนใหม่ในระบบ'
      };
    }
  } catch (e) {
    data = {
      title: 'การแจ้งเตือนใหม่',
      body: event.data ? event.data.text() : 'มีแจ้งเตือนใหม่ในระบบ'
    };
  }
  
  const options = {
    body: data.body,
    icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔔</text></svg>',
    vibrate: [200, 100, 200],
    data: data.data || {}
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// จัดการเมื่อคลิกการแจ้งเตือน
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(clients => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          return;
        }
      }
      
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
