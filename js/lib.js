export const resources = { cold_water: 'Холодная вода', hot_water: 'Горячая вода', electricity: 'Электроэнергия' };
export const unit = (resource) => resource === 'electricity' ? 'кВт·ч' : 'м³';
export const number = (n) => n == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(n);
export const date = (s) => s ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow' }).format(new Date(s.length === 10 ? `${s}T12:00:00Z` : s)) : '—';
export const month = (s) => s ? new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }).format(new Date(`${s}T12:00:00Z`)) : '';
export function today(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (key) => parts.find((p) => p.type === key).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export const windowOpen = (w, day = today()) => !!w && day >= w.opens_on && day <= w.closes_on;
export function parseReading(value) {
  const s = String(value).trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,3})?$/.test(s)) throw new Error('Введите неотрицательное число, не более трёх знаков после запятой.');
  const n = Number(s);
  if (!Number.isFinite(n) || n >= 100000000000) throw new Error('Значение слишком большое.');
  return n;
}
export function previousValues(meter, readings, period) {
  const previous = readings.find((r) => r.period < period);
  return [1, 2, 3].slice(0, meter.tariffs).map((i) => previous?.[`t${i}`] ?? meter[`initial_t${i}`]);
}
export function consumption(values, previous, coefficient = 1) {
  return values.map((v, i) => {
    if (Math.round(v * 1000) < Math.round(previous[i] * 1000)) throw new Error('Показание не может быть меньше предыдущего.');
    return (Math.round(v * 1000) - Math.round(previous[i] * 1000)) / 1000 * coefficient;
  });
}
const messages = {
  'invalid credentials': 'Неверная почта или пароль либо доступ отключён.',
  'authentication required': 'Войдите в личный кабинет.',
  'invalid or expired link': 'Ссылка недействительна или срок её действия истёк. Запросите новую.',
  'reading window is closed': 'Приём показаний закрыт. Обратитесь в УК/ТСЖ.',
  'reading already submitted; contact management': 'Показания уже внесены другим собственником или сотрудником. Для исправления обратитесь в УК/ТСЖ.',
  'reading changed; refresh and try again': 'Показания изменились. Обновите страницу и проверьте значения.',
  'email delivery is not configured; contact management': 'Регистрация по почте пока недоступна. Обратитесь в УК/ТСЖ.',
  'too many attempts; try later': 'Слишком много попыток. Повторите через 15 минут.',
  'period: only the open period is allowed': 'Передавать показания можно только за открытый месяц.',
  'not found': 'Объект не найден или доступ к нему прекращён.',
  'current_password: is incorrect': 'Текущий пароль неверен.',
};
export function errorMessage(error) {
  if (messages[error.message]) return messages[error.message];
  if (/must not be less than previous reading/.test(error.message)) return 'Показание меньше предыдущего или начального значения.';
  if (/must not be greater than next reading/.test(error.message)) return 'Показание превышает более позднее значение. Обратитесь в УК/ТСЖ.';
  if (/must be at least 8/.test(error.message)) return 'Пароль должен содержать не менее 8 символов.';
  if (/must be at most 72/.test(error.message)) return 'Пароль слишком длинный: максимум 72 байта.';
  if (/password changed; sign in again/.test(error.message)) return 'Пароль изменён. Войдите заново.';
  if (/already exists/.test(error.message)) return 'Запись уже существует. Обновите страницу.';
  if (error.status >= 500) return 'Сервис временно недоступен. Попробуйте позже.';
  return error.status ? 'Не удалось выполнить действие. Проверьте данные и попробуйте ещё раз.' : error.message;
}
