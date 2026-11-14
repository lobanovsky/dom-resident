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

test('видимые статусы: проверка, одобрение и отказ, включая архивные состояния', () => {
  const row = (effective_status, active = false) => ({ id: 1, effective_status, active, eligible: true });
  for (const state of ['rejected', 'revoked', 'cancelled', 'expired', 'ineligible']) {
    assert.equal(groupGateRequests([row(state)])[0].display_status, 'rejected');
  }
  assert.equal(groupGateRequests([row('pending')])[0].display_status, 'pending');
  assert.equal(groupGateRequests([row('approved', true)])[0].display_status, 'approved');
  const mixed = [
    { ...row('ineligible'), group_id: 1 },
    { ...row('approved', true), id: 2, group_id: 1 },
  ];
  assert.equal(groupGateRequests(mixed)[0].display_status, 'approved');
  mixed[1].effective_status = 'pending';
  mixed[1].active = false;
  assert.equal(groupGateRequests(mixed)[0].display_status, 'rejected');
});

test('ожидающая заявка сохраняет проверку даже при утрате права', () => {
  assert.equal(
    groupGateRequests([{ id: 1, status: 'pending', effective_status: 'ineligible', eligible: false, active: false }])[0]
      .display_status,
    'pending',
  );
});

import { gateVehicles, gateVehicleLabel } from './gateForm.js';
test('все действующие автомобили показаны, снятые с использования остаются в архиве', () => {
  const row = {
    vehicles: [
      { plate_number: 'А123АА77', brand: 'Toyota', active: true },
      { plate_number: 'В456ВВ77', brand: 'Kia', active: true },
      { plate_number: 'С789СС77', brand: 'Ford', active: false },
    ],
  };
  assert.equal(gateVehicles(row).length, 2);
  assert.equal(gateVehicleLabel(gateVehicles(row)[1]), 'В456ВВ77 · Kia');
  assert.equal(gateVehicles(row, false)[0].brand, 'Ford');
  assert.equal(gateVehicles({ vehicle_plate: 'А123АА77', vehicle_brand: 'Toyota' }).length, 1);
  assert.deepEqual(
    gateVehicles({ vehicles: [{ plate_number: 'С789СС77', active: false }], vehicle_plate: 'С789СС77' }),
    [],
  );
});
