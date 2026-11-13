import test from 'node:test';
import assert from 'node:assert/strict';
import { formatGatePhone, groupGateRequests } from './gateForm.js';

test('маска российского телефона: ввод, вставка и ограничение длины', () => {
  assert.equal(formatGatePhone(''), '+7');
  assert.equal(formatGatePhone('+7'), '+7');
  assert.equal(formatGatePhone('9267936363'), '+7 926 793 63 63');
  assert.equal(formatGatePhone('+7 (926) 793-63-63'), '+7 926 793 63 63');
  assert.equal(formatGatePhone('8 926 793 63 63'), '+7 926 793 63 63');
  assert.equal(formatGatePhone('+7 9267'), '+7 926 7');
  assert.equal(formatGatePhone('+7 926 793 63 639'), '+7 926 793 63 63');
});
test('несколько объектов составляют одну заявку с корневым идентификатором', () => {
  const rows = [
    { id: 11, group_id: 10, effective_status: 'approved', eligible: true, active: true },
    { id: 10, group_id: 10, effective_status: 'approved', eligible: true, active: true },
    { id: 20, effective_status: 'pending', eligible: true, active: false },
  ];
  const groups = groupGateRequests(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].id, 10);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].effective_status, 'approved');
  rows[1].effective_status = 'ineligible';
  rows[1].eligible = false;
  rows[1].active = false;
  const partial = groupGateRequests(rows)[0];
  assert.equal(partial.effective_status, 'partial');
  assert.equal(partial.active, true);
  assert.equal(partial.eligible, false);
});
