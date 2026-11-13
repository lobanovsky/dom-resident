import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppUpdater } from './appUpdate.js';
import { beginMutation, hasPendingMutations, isAppUpdating } from './requestState.js';

function setup(options = {}) {
  const busy = []; let reloads = 0; let calls = 0;
  const update = createAppUpdater({
    hasUnsavedChanges: () => false, confirm: () => true,
    fetch: async (url, config) => {
      calls++; assert.equal(url, '/api/v1/resident/healthz');
      assert.equal(config.cache, 'no-store'); assert.equal(config.credentials, 'same-origin');
      return new Response('{"status":"ok"}');
    },
    reload: () => { reloads++; }, setBusy: (value) => busy.push(value), ...options,
  });
  return { update, busy, get reloads() { return reloads; }, get calls() { return calls; } };
}

test('обычный браузер без service worker перезагружается после проверки сети', async () => {
  const s = setup(); assert.equal(await s.update(), true);
  assert.equal(s.reloads, 1); assert.equal(s.calls, 1); assert.deepEqual(s.busy, [true, false]);
  assert.equal(isAppUpdating(), false);
});

test('отмена при черновике сохраняет страницу и не запускает обновление', async () => {
  const s = setup({ hasUnsavedChanges: () => true, confirm: () => false });
  assert.equal(await s.update(), false); assert.equal(s.calls, 0); assert.equal(s.reloads, 0); assert.deepEqual(s.busy, []);
});

test('после подтверждения потери черновика обновление выполняется', async () => {
  let confirmations = 0;
  const s = setup({ hasUnsavedChanges: () => true, confirm: () => { confirmations++; return true; } });
  await s.update(); assert.equal(confirmations, 1); assert.equal(s.reloads, 1);
});

test('без сети и при неверном ответе сервера не перезагружается и снимает блокировку', async () => {
  for (const fetch of [async () => { throw new TypeError('offline'); }, async () => new Response('bad', { status: 503 }), async () => new Response('{}')]) {
    const s = setup({ fetch }); await assert.rejects(s.update(), /Не удалось обновить/);
    assert.equal(s.reloads, 0); assert.deepEqual(s.busy, [true, false]); assert.equal(isAppUpdating(), false);
  }
});

test('обновление запрещено при сохранении, а новые сохранения — во время обновления', async () => {
  const finish = beginMutation();
  const blocked = setup(); assert.equal(await blocked.update(), false); assert.equal(blocked.calls, 0);
  finish(); assert.equal(hasPendingMutations(), false);
  let resume;
  const s = setup({ fetch: () => new Promise((resolve) => { resume = resolve; }) });
  const pending = s.update();
  assert.throws(() => beginMutation(), /Дождитесь завершения/);
  assert.equal(await s.update(), false);
  resume(new Response('{"status":"ok"}')); await pending; assert.equal(s.reloads, 1);
});

test('установленный PWA проверяет обновление и ждёт активации worker', async () => {
  const worker = new EventTarget(); worker.state = 'installing';
  let updates = 0;
  const s = setup({ serviceWorker: { getRegistration: async (scope) => {
    assert.equal(scope, '/'); return { update: async () => { updates++; }, installing: worker };
  } } });
  const pending = s.update(); await new Promise(setImmediate);
  assert.equal(updates, 1); assert.equal(s.reloads, 0);
  worker.state = 'activated'; worker.dispatchEvent(new Event('statechange'));
  await pending; assert.equal(s.reloads, 1);
});

test('service worker без новой версии не мешает перезагрузке', async () => {
  const s = setup({ serviceWorker: { getRegistration: async () => ({ update: async () => {}, installing: null, waiting: null }) } });
  await s.update(); assert.equal(s.reloads, 1);
});

test('тайм-аут обновления не допускает запоздалой перезагрузки', async () => {
  let resume;
  const s = setup({ timeout: 15, serviceWorker: { getRegistration: async () => ({ update: () => new Promise((resolve) => { resume = resolve; }) }) } });
  await assert.rejects(s.update(), /слишком много времени/);
  assert.equal(s.reloads, 0); assert.equal(isAppUpdating(), false);
  resume(); await new Promise(setImmediate); assert.equal(s.reloads, 0);
});

test('ошибка установки worker оставляет текущую версию открытой', async () => {
  const worker = new EventTarget(); worker.state = 'installing';
  const s = setup({ serviceWorker: { getRegistration: async () => ({ update: async () => {}, installing: worker }) } });
  const pending = s.update(); await new Promise(setImmediate);
  worker.state = 'redundant'; worker.dispatchEvent(new Event('statechange'));
  await assert.rejects(pending, /Не удалось обновить/); assert.equal(s.reloads, 0);
});
