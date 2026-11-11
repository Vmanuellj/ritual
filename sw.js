// Service worker de ritual.: hace la app instalable y la abre aunque la señal sea mala.
// Siempre intenta la versión más nueva primero; la copia guardada solo se usa sin conexión.
const CACHE = 'ritual-v1';
const SHELL = ['./', 'index.html', 'icon.svg', 'icon-192.png', 'icon-512.png', 'grain.svg', 'manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Solo archivos propios del sitio; nunca la API ni la base de datos.
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
