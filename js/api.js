export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`/api/v1/resident${path}`, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  } catch { throw new Error('Нет связи с сервером. Проверьте подключение и повторите попытку.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const e = new Error(data.error || 'Ошибка запроса'); e.status = response.status; throw e; }
  return data;
}
