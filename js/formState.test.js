import test from 'node:test';
import assert from 'node:assert/strict';
import { trackForm, markFormSaved, hasUnsavedForms, hasDraftChanges } from './formState.js';

test('предзаполненная форма не грязная; успешное сохранение сбрасывает предупреждение', () => {
  const control = { name: 'email', type: 'email', value: 'resident@example.com' };
  const form = { isConnected: true, querySelectorAll: () => [control] };
  trackForm(form); assert.equal(hasUnsavedForms(), false);
  control.value = 'changed@example.com'; assert.equal(hasUnsavedForms(), true);
  markFormSaved(form); assert.equal(hasUnsavedForms(), false);
  control.value = 'draft@example.com'; form.isConnected = false;
  assert.equal(hasUnsavedForms(), false);
});

test('автоматически заполненные показания и комментарий не считаются изменёнными', () => {
  const draft = { values: ['100', '50'], initialValues: [100, 50], comment: 'Ранее передано', initialComment: 'Ранее передано' };
  assert.equal(hasDraftChanges(draft), false);
  draft.values[0] = '101'; assert.equal(hasDraftChanges(draft), true);
  draft.values[0] = '100'; draft.comment = 'Новый комментарий'; assert.equal(hasDraftChanges(draft), true);
});
