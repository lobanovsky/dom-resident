import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReading, consumption, windowOpen, today, previousValues, errorMessage } from './lib.js';
test('показания: запятая, точность и запрет пустого значения', () => {
  assert.equal(parseReading('123,456'), 123.456);
  assert.equal(parseReading('1 346.14'), 1346.14);
  assert.equal(parseReading('1\u00a0346.14'), 1346.14);
  assert.equal(parseReading('0'), 0);
  for (const value of ['', '-1', '1.1234', '1e4', 'Infinity', '100000000000']) assert.throws(() => parseReading(value));
});
test('нулевой расход и уменьшение накопительного значения', () => {
  assert.deepEqual(consumption([100, 50], [100, 50]), [0, 0]);
  assert.deepEqual(consumption([100.123], [100], 2), [0.246]);
  assert.throws(() => consumption([0], [100]));
});
test('период закрыт без настройки, даты по Москве', () => {
  assert.equal(windowOpen(null), false);
  const w = { opens_on: '2026-11-20', closes_on: '2026-11-25' };
  assert.equal(windowOpen(w, '2026-11-20'), true);
  assert.equal(windowOpen(w, '2026-11-26'), false);
  assert.equal(today(new Date('2026-11-19T22:00:00Z')), '2026-11-20');
});
test('текущее показание исключается из базы расхода при исправлении', () => {
  const meter = { tariffs: 1, initial_t1: 5 };
  assert.deepEqual(previousValues(meter, [{ period: '2026-11-01', t1: 100 }, { period: '2026-10-01', t1: 80 }], '2026-11-01'), [80]);
  assert.deepEqual(previousValues(meter, [], '2026-11-01'), [5]);
});

import { windowMessage, buildBatch, propertyMeters, month } from './lib.js';
test('календарь использует серверную дату, флаг включения и следующий приём', () => {
  const w = { enabled: true, period: '2026-11-01', server_date: '2026-11-09', opens_on: '2026-11-17', closes_on: '2026-11-22', next_opens_on: '2026-11-17' };
  assert.match(windowMessage(w), /откроется 17 ноября/);
  assert.equal(windowOpen(w), false);
  assert.equal(windowOpen({ ...w, server_date: '2026-11-17' }), true);
  assert.equal(windowOpen({ ...w, server_date: '2026-11-22' }), true);
  assert.equal(windowOpen({ ...w, server_date: '2026-11-23' }), false);
  assert.equal(windowOpen({ ...w, enabled: false, server_date: '2026-11-20' }), false);
  assert.match(windowMessage({ ...w, server_date: '2026-11-23', next_opens_on: '2026-12-17' }), /Следующий приём — 17 декабря/);
  assert.equal(month('2026-11-01'), 'ноябрь 2026');
});
test('пакет пропускает пустые приборы, сохраняет нулевой расход и ревизию', () => {
  const meter = { id: 1, coefficient: 1 };
  const rows = buildBatch([{ meter, previous: [100], values: ['100'], comment: 'На даче', revision: 7 }, { meter: { id: 2 }, previous: [5], values: [''], comment: '' }], '2026-11-01');
  assert.deepEqual(rows, [{ meter_id: 1, period: '2026-11-01', t1: 100, comment: 'На даче', revision: 7 }]);
  assert.throws(() => buildBatch([{ meter, previous: [100, 5], values: ['101', ''] }], '2026-11-01'), (e) => e.meterId === 1);
  assert.throws(() => buildBatch([{ meter, previous: [100], values: [''], comment: 'Есть комментарий' }], '2026-11-01'), (e) => e.meterId === 1);
  assert.deepEqual(propertyMeters({ id: 8 }, [{ id: 1, premises_id: 9 }]), []);
});


test('ошибки заявки на въезд объясняют повтор, утрату права и формат телефона', () => {
 assert.match(errorMessage(new Error('gate: duplicate request')), /уже есть заявка/);
 assert.match(errorMessage(new Error('gate: property is not eligible')), /нет действующего права/);
 assert.match(errorMessage(new Error('phone: gate phone must contain 11 to 15 digits')), /кодом страны/);
});
