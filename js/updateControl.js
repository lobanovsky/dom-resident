import { button, el } from './dom.js';
import { createAppUpdater } from './appUpdate.js';
import { hasUnsavedForms } from './formState.js';
import { hasReadingDraftChanges } from './readings.js';
import { hasPendingMutations, isAppUpdating, subscribeRequests } from './requestState.js';

let announcement;
export function updateControl(signal) {
  if (!announcement) {
    announcement = el('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
    document.body.append(announcement);
  }
  const error = el('p', { class: 'update-error', role: 'alert', hidden: true });
  const control = button('↻ Обновить', async () => {
    error.hidden = true;
    try { await update(); }
    catch (e) { error.textContent = e.message; error.hidden = false; }
  }, 'update-button');
  control.setAttribute('aria-label', 'Обновить приложение');
  let wasInert = false;
  const update = createAppUpdater({
    hasUnsavedChanges: () => hasUnsavedForms() || hasReadingDraftChanges(),
    confirm: (message) => window.confirm(message),
    fetch: (...args) => window.fetch(...args),
    serviceWorker: navigator.serviceWorker,
    reload: () => window.location.reload(),
    setBusy: (busy) => {
      const root = document.querySelector('#app');
      if (busy) wasInert = root.inert;
      root.inert = busy || wasInert;
      root.setAttribute('aria-busy', String(busy));
      announcement.textContent = busy ? 'Обновление приложения…' : '';
    },
  });
  subscribeRequests(() => {
    control.disabled = hasPendingMutations() || isAppUpdating();
    control.textContent = isAppUpdating() ? 'Обновление…' : '↻ Обновить';
    control.title = hasPendingMutations() ? 'Дождитесь завершения отправки данных' : 'Загрузить свежую версию приложения';
  }, signal);
  return el('div', { class: 'update-control' }, [control, error]);
}
