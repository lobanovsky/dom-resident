// Храним исходные значения только в памяти; отсоединённые формы удаляем из списка.
const forms = new Map();
export function hasDraftChanges(draft) {
  return draft.comment !== draft.initialComment || draft.values.some((value, i) => String(value) !== String(draft.initialValues[i]));
}
function values(form) {
  return JSON.stringify([...form.querySelectorAll('input, textarea, select')].map((control) =>
    [control.name, control.type === 'checkbox' || control.type === 'radio' ? control.checked : control.value]));
}
function prune() { for (const form of forms.keys()) if (!form.isConnected) forms.delete(form); }
export function trackForm(form) { prune(); forms.set(form, values(form)); }
export function markFormSaved(form) { if (forms.has(form)) forms.set(form, values(form)); }
export function hasUnsavedForms() {
  prune();
  return [...forms].some(([form, initial]) => values(form) !== initial);
}
