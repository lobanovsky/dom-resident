// Общая блокировка сохраняющих запросов и ручного обновления приложения.
let pending = 0;
let updating = false;
const listeners = new Set();
const notify = () => { for (const listener of listeners) listener(); };
export const hasPendingMutations = () => pending > 0;
export const isAppUpdating = () => updating;
export function subscribeRequests(listener, signal) {
  listeners.add(listener);
  signal?.addEventListener('abort', () => listeners.delete(listener), { once: true });
  listener();
}
export function beginMutation() {
  if (updating) throw new Error('Дождитесь завершения обновления приложения.');
  pending++; notify();
  return () => { pending--; notify(); };
}
export function beginAppUpdate() {
  if (pending || updating) return false;
  updating = true; notify(); return true;
}
export function endAppUpdate() { updating = false; notify(); }
