import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReading, consumption, windowOpen, today, previousValues } from './lib.js';
test('показания: запятая, точность и запрет пустого значения', () => {
  assert.equal(parseReading('123,456'), 123.456);
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
