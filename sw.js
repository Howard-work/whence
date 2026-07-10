/* whence — 最簡 Service Worker（滿足 PWA 安裝條件；離線佇列為遠期功能） */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* pass-through：一律走網路 */ });
