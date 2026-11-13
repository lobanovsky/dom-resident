import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const readAsset = (path) => readFile(new URL(`..${path}`, import.meta.url));

function worker(fetch = async () => new Response('online')) {
  const handlers = new Map();
  const cached = []; const deleted = []; let opened = 0;
  const offline = new Response('public offline page');
  vm.runInNewContext(source, {
    URL, Response, fetch,
    self: {
      location: { origin: 'https://resident.example' },
      addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: async () => {}, clients: { claim: async () => {} },
    },
    caches: {
      open: async () => { opened++; return { addAll: async (paths) => cached.push(...paths), match: async () => offline }; },
      keys: async () => ['dom-resident-public-old', 'another-app-cache'],
      delete: async (name) => { deleted.push(name); },
    },
  });
  return { handlers, cached, deleted, get opened() { return opened; } };
}

test('имя приложения и размеры иконок соответствуют манифесту и iPhone', async () => {
  const manifest = JSON.parse(await readAsset('/manifest.webmanifest'));
  assert.equal(manifest.name, 'ТСН МР17дом1');
  assert.equal(manifest.short_name, manifest.name);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  for (const icon of manifest.icons) {
    const png = await readAsset(icon.src);
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
  const apple = await readAsset('/icons/apple-touch-icon.png');
  assert.equal(apple.readUInt32BE(16), 180);
  assert.equal(apple.readUInt32BE(20), 180);
  const html = (await readAsset('/index.html')).toString();
  assert.match(html, /name="apple-mobile-web-app-title" content="ТСН МР17дом1"/);
  assert.match(html, /rel="manifest" href="\/manifest.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\/icons\/apple-touch-icon.png"/);
});

test('кэш установки содержит только публичные существующие файлы', async () => {
  const w = worker(); let done;
  w.handlers.get('install')({ waitUntil: (promise) => { done = promise; } });
  await done;
  assert.ok(w.cached.includes('/offline.html'));
  assert.ok(w.cached.every((path) => path === '/offline.html' || path.startsWith('/icons/')));
  await Promise.all(w.cached.map(readAsset));
});

test('service worker не перехватывает API, отправку форм и чужие адреса', () => {
  const w = worker();
  for (const request of [
    { url: 'https://resident.example/api/v1/resident/me', method: 'GET', mode: 'cors' },
    { url: 'https://resident.example/api/v1/resident/meters', method: 'GET', mode: 'navigate' },
    { url: 'https://resident.example/healthz', method: 'GET', mode: 'navigate' },
    { url: 'https://resident.example/', method: 'POST', mode: 'navigate' },
    { url: 'https://another.example/', method: 'GET', mode: 'navigate' },
  ]) {
    w.handlers.get('fetch')({ request, respondWith: () => assert.fail('Запрос не должен перехватываться') });
  }
  assert.equal(w.opened, 0);
});

test('онлайн HTML идёт с сервера без кэширования, без сети открывается публичная заглушка', async () => {
  const request = { url: 'https://resident.example/', method: 'GET', mode: 'navigate' };
  const online = worker(); let response;
  online.handlers.get('fetch')({ request, respondWith: (promise) => { response = promise; } });
  assert.equal(await (await response).text(), 'online');
  assert.equal(online.opened, 0);
  const offline = worker(async () => { throw new TypeError('network unavailable'); });
  offline.handlers.get('fetch')({ request, respondWith: (promise) => { response = promise; } });
  assert.equal(await (await response).text(), 'public offline page');
});

test('обновление очищает только предыдущие публичные кэши кабинета', async () => {
  const w = worker(); let done;
  w.handlers.get('activate')({ waitUntil: (promise) => { done = promise; } });
  await done;
  assert.deepEqual(w.deleted, ['dom-resident-public-old']);
});
