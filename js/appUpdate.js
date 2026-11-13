import { beginAppUpdate, endAppUpdate, hasPendingMutations, isAppUpdating } from './requestState.js';

function waitForActivation(worker, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { worker.removeEventListener('statechange', changed); signal.removeEventListener('abort', aborted); };
    const aborted = () => { cleanup(); reject(signal.reason); };
    const changed = () => {
      if (worker.state === 'activated') { cleanup(); resolve(); }
      else if (worker.state === 'redundant') { cleanup(); reject(new Error('Не удалось установить обновление.')); }
    };
    worker.addEventListener('statechange', changed);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted(); else changed();
  });
}

export async function updateServiceWorker(serviceWorker, signal) {
  if (!serviceWorker) return;
  const registration = await serviceWorker.getRegistration('/');
  signal.throwIfAborted();
  if (!registration) return;
  await registration.update();
  signal.throwIfAborted();
  const worker = registration.installing || registration.waiting;
  if (worker) await waitForActivation(worker, signal);
}

export function createAppUpdater({ hasUnsavedChanges, confirm, fetch, serviceWorker, reload, setBusy, timeout = 10000 }) {
  return async () => {
    if (hasPendingMutations() || isAppUpdating()) return false;
    if (hasUnsavedChanges() && !confirm('Неотправленные данные будут потеряны. Обновить приложение?')) return false;
    if (!beginAppUpdate()) return false;
    const abort = new AbortController();
    let timer;
    try {
      setBusy(true);
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error('Обновление заняло слишком много времени. Попробуйте ещё раз.');
          abort.abort(error); reject(error);
        }, timeout);
      });
      await Promise.race([deadline, (async () => {
        const response = await fetch('/api/v1/resident/healthz', { cache: 'no-store', credentials: 'same-origin', signal: abort.signal });
        if (!response.ok || (await response.json()).status !== 'ok') throw new Error('Нет связи с сервером. Проверьте подключение и повторите попытку.');
        abort.signal.throwIfAborted();
        await updateServiceWorker(serviceWorker, abort.signal);
        abort.signal.throwIfAborted();
      })()]);
      abort.signal.throwIfAborted();
      reload();
      return true;
    } catch (error) {
      if (abort.signal.aborted) throw abort.signal.reason;
      throw new Error('Не удалось обновить приложение. Проверьте подключение и попробуйте ещё раз.', { cause: error });
    } finally {
      clearTimeout(timer); abort.abort(); setBusy(false); endAppUpdate();
    }
  };
}
