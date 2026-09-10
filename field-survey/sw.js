const CACHE = 'condition-survey-shell-0.10.0-r1';
const ASSETS = ['./recorder.html', './app.css', './app.js', './model.js', './report.js', './report-ui.js', './report-standard.js', './organisation.js', './detail.js', './store.js', './bundle.js', './annotation.js', './sketch.js', './stairs.js', './cracks.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))))); });
self.addEventListener('activate', event => { event.waitUntil((async () => { for (const key of await caches.keys()) if (key.startsWith('condition-survey-shell-') && key !== CACHE) await caches.delete(key); await self.clients.claim(); })()); });
self.addEventListener('message', event => { if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url), scope = new URL(self.registration.scope);
  if (event.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (event.request.mode === 'navigate') { event.respondWith(caches.open(CACHE).then(cache => cache.match('./recorder.html')).then(response => response || fetch(event.request))); return; }
  if (ASSETS.some(asset => new URL(asset, scope).pathname === url.pathname)) event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(response => response || fetch(event.request)));
});
