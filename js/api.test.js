import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from './api.js';
import { beginAppUpdate, endAppUpdate, hasPendingMutations } from './requestState.js';

test('сохраняющий запрос блокирует обновление до чтения ответа, затем снимает блокировку', async (t) => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  let finishBody;
  globalThis.fetch = async () => ({ ok: true, json: () => new Promise((resolve) => { finishBody = resolve; }) });
  const pending = api('/meters/1/readings', { method: 'POST', body: { t1: 123 } });
  await new Promise(setImmediate);
  assert.equal(hasPendingMutations(), true); assert.equal(beginAppUpdate(), false);
  finishBody({ ok: true }); await pending; assert.equal(hasPendingMutations(), false);
});

test('ошибка запроса не оставляет обновление заблокированным; обновление запрещает новые записи', async (t) => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  await assert.rejects(api('/auth/login', { method: 'POST', body: {} }));
  assert.equal(hasPendingMutations(), false);
  assert.equal(beginAppUpdate(), true);
  try { await assert.rejects(api('/auth/login', { method: 'POST', body: {} }), /Дождитесь завершения/); }
  finally { endAppUpdate(); }
});
