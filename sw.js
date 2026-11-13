// В кэше только публичная страница без сети и иконки. Данные жителей и API туда не попадают.
const CACHE_PREFIX = 'dom-resident-public-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = '/offline.html';
const PUBLIC_FILES = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/icons/favicon-32.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names
    .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
    .map((name) => caches.delete(name))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' || url.origin !== self.location.origin
      || url.pathname === '/api' || url.pathname.startsWith('/api/') || url.pathname === '/healthz') return;

  // HTML всегда запрашивается с сервера; при отсутствии сети возвращается публичная заглушка.
  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(OFFLINE_URL) || new Response('Нет подключения к интернету. Подключитесь к сети и повторите вход в личный кабинет.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }));
});
