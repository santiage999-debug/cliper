// Service worker mínimo: hace la app instalable y guarda en caché los recursos pesados (wasm, modelos, fuentes)
const C = 'cliper-v2';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('.apk')) return;
  if (/\.(wasm|ttf|mp3|tflite|mjs)$/.test(u.pathname) || u.pathname.includes('/assets/')) e.respondWith(caches.open(C).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
});
