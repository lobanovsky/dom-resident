import { beginMutation } from './requestState.js';

export async function api(path, { method = 'GET', body } = {}) {
  const finish = ['GET', 'HEAD'].includes(method.toUpperCase()) ? () => {} : beginMutation();
  try { return await request(path, { method, body }); }
  finally { finish(); }
}

async function request(path, { method, body }) {
  let response;
  try {
    response = await fetch(`/api/v1/resident${path}`, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  } catch { throw new Error('Нет связи с сервером. Проверьте подключение и повторите попытку.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const e = new Error(data.error || 'Ошибка запроса'); e.status = response.status; e.meterId = data.meter_id; throw e; }
  return data;
}
