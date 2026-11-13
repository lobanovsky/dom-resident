export const resources = { cold_water: 'Холодная вода', hot_water: 'Горячая вода', electricity: 'Электроэнергия' };
export const unit = (resource) => resource === 'electricity' ? 'кВт·ч' : 'м³';
export const number = (n) => n == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(n);
export const date = (s) => s ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow' }).format(new Date(s.length === 10 ? `${s}T12:00:00Z` : s)) : '—';
export const month = (s) => s ? new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: 'Europe/Moscow' }).format(new Date(`${s}T12:00:00Z`)) + ' ' + s.slice(0, 4) : '';
export const shortDate = (s) => s ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' }).format(new Date(`${s}T12:00:00Z`)) : '';
export const dateTime = (s) => s ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(new Date(s)) : '';
export function today(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (key) => parts.find((p) => p.type === key).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export const windowOpen = (w, day = w?.server_date || today()) => !!w && w.enabled !== false && day >= w.opens_on && day <= w.closes_on;
export function windowMessage(w) {
  if (!w) return 'Приём показаний пока не настроен.';
  if (windowOpen(w)) return `Приём за ${month(w.period)} до ${shortDate(w.closes_on)} включительно.`;
  const day = w.server_date || today();
  if (w.enabled && day < w.opens_on) return `Приём за ${month(w.period)} откроется ${shortDate(w.opens_on)}.`;
  const closed = w.enabled ? `Приём за ${month(w.period)} завершён.` : 'Приём показаний отключён.';
  return closed + (w.next_opens_on ? ` Следующий приём — ${shortDate(w.next_opens_on)}.` : ' Даты можно уточнить в ТСЖ.');
}
export function propertyMeters(property, meters) { return meters.filter((m) => m.premises_id === property.id); }
export function buildBatch(entries, period) {
  const readings = [];
  for (const { meter, values, previous, comment, revision } of entries) {
    if (values.every((v) => String(v).trim() === '')) {
      if (String(comment || '').trim()) { const e = new Error('Чтобы передать комментарий, укажите показание или нажмите «Без изменений».'); e.meterId = meter.id; throw e; }
      continue;
    }
    try {
      const parsed = values.map(parseReading);
      consumption(parsed, previous, meter.coefficient);
      readings.push({ meter_id: meter.id, period, ...Object.fromEntries(parsed.map((v, i) => [`t${i + 1}`, v])), comment: String(comment || '').trim() || null, ...(revision != null ? { revision } : {}) });
    } catch (e) { e.meterId = meter.id; throw e; }
  }
  if (!readings.length) throw new Error('Заполните показания хотя бы одного счётчика. Пустые поля не отправляются.');
  return readings;
}
export function parseReading(value) {
  const s = String(value).replace(/\s+/gu, '').replace(',', '.');
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
  'premises_ids: select 1 to 50 properties': 'Выберите хотя бы один объект недвижимости (не более 50).',
  'vehicle: car must be empty without a personal vehicle': 'При отметке «Нет личного автомобиля» номер и марка должны быть пустыми.',
  'gate: property is not eligible': 'Для этого объекта нет действующего права выдавать доступ в выбранную зону.',
  'gate: expiry is in the past': 'Дата окончания доступа уже прошла. Выберите сегодняшнюю или будущую дату.',
  'gate: duplicate request': 'Для этого телефона и объекта уже есть заявка на проверке или одобренный доступ.',
  'gate: request status changed': 'Статус заявки уже изменился. Обновите список.',
  'gate: property or expiry is no longer eligible': 'Заявку нельзя одобрить: право собственности утрачено или срок доступа истёк.',
  'gate: decision reason is required': 'Укажите причину отклонения или отзыва доступа.',
  'gate: invalid decision note': 'Комментарий должен содержать не более 500 символов без служебных знаков.',
  'gate: invalid action': 'Это действие недоступно для вашей роли.',
  'phone: gate phone must contain 11 to 15 digits': 'Укажите телефон с кодом страны, например +7 999 123-45-67.',
  'gate: invalid filters': 'Проверьте фильтры списка заявок.',

  'invalid credentials': 'Неверная почта или пароль либо доступ отключён.',
  'authentication required': 'Войдите в личный кабинет.',
  'invalid or expired link': 'Ссылка недействительна или срок её действия истёк. Запросите новую.',
  'reading window is closed': 'Приём показаний закрыт. Обратитесь в УК/ТСЖ.',
  'reading already submitted; contact management': 'Показания уже внесены другим собственником или сотрудником. Для исправления обратитесь в УК/ТСЖ.',
  'reading changed; refresh and try again': 'Показания изменились. Обновите страницу и проверьте значения.',
  'email delivery is not configured; contact management': 'Регистрация по почте пока недоступна. Обратитесь в УК/ТСЖ.',
  'too many attempts; try later': 'Слишком много попыток. Повторите через 15 минут.',
  'period: only the open period is allowed': 'Передавать показания можно только за открытый месяц.',
  'readings: duplicate meter': 'В отправке повторяется один и тот же счётчик.',
  'not found': 'Объект не найден или доступ к нему прекращён.',
  'current_password: is incorrect': 'Текущий пароль неверен.',
};
export function errorMessage(error) {
  if (/gate text is too long/.test(error.message)) return 'Поле слишком длинное или содержит недопустимые символы.';
  if (/recipient_name: is required/.test(error.message)) return 'Укажите имя получателя доступа.';
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
