import { api } from './api.js';
import { resources, unit, number, date, month, windowOpen, previousValues, parseReading, consumption, errorMessage } from './lib.js';

const root = document.querySelector('#app');
let generation = 0;
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of [children].flat(Infinity)) if (child != null) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
const link = (text, to) => el('a', { href: `#${to}` }, text);
const button = (text, fn, cls = 'button') => el('button', { type: 'button', class: cls, onclick: fn }, text);
const notice = (text, good = false) => el('p', { class: `notice ${good ? 'success' : ''}`, role: good ? 'status' : 'alert' }, text);
function field(label, name, { type = 'text', value, ...attrs } = {}) {
  const control = el(type === 'textarea' ? 'textarea' : 'input', { name, ...(type === 'textarea' ? {} : { type }), ...attrs });
  if (value != null) control.value = value;
  return { node: el('label', { class: 'field' }, [el('span', {}, label), control]), control };
}
function form(fields, label, save) {
  const status = el('div', { 'aria-live': 'polite' });
  const submit = el('button', { class: 'button', type: 'submit' }, label);
  const node = el('form', { class: 'form' }, [...fields.map((f) => f.node), status, submit]);
  node.addEventListener('submit', async (event) => {
    event.preventDefault(); submit.disabled = true; status.replaceChildren();
    try { await save(Object.fromEntries(new FormData(node)), status); }
    catch (e) { status.replaceChildren(notice(errorMessage(e))); }
    finally { submit.disabled = false; }
  });
  return node;
}
function passwordFields() {
  return [field('Пароль', 'password', { type: 'password', required: true, minlength: 8, autocomplete: 'new-password' }), field('Повторите пароль', 'confirm', { type: 'password', required: true, minlength: 8, autocomplete: 'new-password' })];
}
function checkPasswords(data) { if (data.password !== data.confirm) throw new Error('Пароли не совпадают.'); }
function brand() { return el('a', { href: '#home', class: 'brand' }, [el('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'Д'), el('span', {}, ['Мой дом', el('small', {}, 'Личный кабинет собственника')])]); }
function authPage(route) {
  const [page, query] = route.split('?');
  const token = new URLSearchParams(query).get('token');
  if (page === 'set-password' && token) {
    // Ссылка живёт только в памяти страницы, без истории браузера и Referer.
    history.replaceState(null, '', '#set-password');
  }
  const titles = { login: 'Добро пожаловать домой', register: 'Получить доступ', forgot: 'Восстановить пароль', 'set-password': 'Установить пароль' };
  const card = el('section', { class: 'auth-card' }, [brand(), el('h1', {}, titles[page] || titles.login)]);
  if (page === 'set-password') {
    if (!token) card.append(notice('Откройте ссылку из письма. Если срок её действия истёк, запросите новую.'), link('Восстановить доступ', 'forgot'));
    else card.append(el('p', { class: 'muted' }, 'Придумайте пароль не короче 8 символов.'), form(passwordFields(), 'Сохранить пароль', async (data, status) => {
      checkPasswords(data); await api('/auth/set-password', { method: 'POST', body: { token, password: data.password } });
      card.replaceChildren(brand(), el('h1', {}, 'Пароль установлен'), notice('Теперь можно войти с вашей почтой и новым паролем.', true), link('Перейти ко входу', 'login'));
    }));
  } else if (page === 'register' || page === 'forgot') {
    card.append(el('p', { class: 'muted' }, page === 'register' ? 'Укажите почту, подтверждённую в УК/ТСЖ. Мы отправим ссылку для установки пароля.' : 'Укажите почту, с которой вы входите в кабинет.'), form([field('Электронная почта', 'email', { type: 'email', required: true, autocomplete: 'email', maxlength: 254 })], 'Получить письмо', async (data, status) => {
      const result = await api(`/auth/${page === 'register' ? 'register' : 'forgot-password'}`, { method: 'POST', body: data });
      status.replaceChildren(notice(result.message, true), el('p', { class: 'muted' }, 'Проверьте папку «Спам». Если письмо не приходит, обратитесь в УК/ТСЖ для проверки контактов.'));
    }), link('Вернуться ко входу', 'login'));
  } else {
    card.append(el('p', { class: 'muted' }, 'Ваша недвижимость и показания счётчиков в одном месте.'), form([
      field('Электронная почта', 'email', { type: 'email', required: true, autocomplete: 'username' }), field('Пароль', 'password', { type: 'password', required: true, autocomplete: 'current-password' }),
    ], 'Войти', async (data) => { await api('/auth/login', { method: 'POST', body: data }); location.hash = 'home'; }), el('div', { class: 'auth-links' }, [link('Получить доступ', 'register'), link('Забыли пароль?', 'forgot')]));
  }
  root.replaceChildren(el('main', { class: 'auth-layout' }, [el('aside', { class: 'auth-aside' }, [el('p', { class: 'eyebrow' }, 'ВАШ ДОМ — РЯДОМ'), el('h2', {}, 'Меньше забот.\nБольше жизни.'), el('p', {}, 'Передавайте показания, проверяйте расход и находите информацию о своей недвижимости — с телефона или компьютера.'), el('div', { class: 'house-art', 'aria-hidden': 'true' }, Array.from({ length: 24 }, () => el('i')))]), card]));
}
function definitions(items) { return el('dl', { class: 'definitions' }, items.map(([key, value]) => [el('dt', {}, key), el('dd', {}, value == null || value === '' ? '—' : value)])); }
function propertyCard(p) {
  return el('article', { class: 'card property-card' }, [el('span', { class: `property-icon ${p.kind}`, 'aria-hidden': 'true' }, p.kind === 'parking_space' ? 'P' : '⌂'), el('div', {}, [el('p', { class: 'eyebrow' }, p.kind_name), el('h3', {}, `№ ${p.number}`), el('p', { class: 'muted' }, p.address)]), definitions([
    ['Площадь', p.total_area == null ? '—' : `${number(p.total_area)} м²`], ['Доля собственности', `${p.share_num}/${p.share_den} · ${number(p.share_num / p.share_den * 100)}%`], ['Этаж / подъезд', `${p.floor ?? '—'} / ${p.entrance ?? '—'}`], ['Комнат', p.rooms], ['Кадастровый номер', p.cadastral_number],
  ]), link('Счётчики и показания →', `meters?premises=${p.id}`)]);
}
async function shell(page, data) {
  const { person } = data;
  const main = el('main', { class: 'main', id: 'main-content', tabindex: '-1' });
  const tabs = [['home', 'Обзор'], ['properties', 'Моя недвижимость'], ['meters', 'Показания'], ['profile', 'Профиль']];
  root.replaceChildren(el('a', { href: '#main-content', class: 'skip', onclick: (event) => { event.preventDefault(); main.focus(); } }, 'Перейти к содержимому'), el('header', { class: 'header' }, [brand(), el('nav', { 'aria-label': 'Основная навигация' }, tabs.map(([to, text]) => el('a', { href: `#${to}`, class: page === to ? 'active' : '', 'aria-current': page === to ? 'page' : null }, text))), button('Выйти', async () => {
    try { await api('/auth/logout', { method: 'POST', body: {} }); location.hash = 'login'; }
    catch (e) { main.prepend(notice(errorMessage(e))); }
  }, 'button ghost')]), main, el('footer', {}, 'Личный кабинет собственника · По вопросам данных и доступа обратитесь в вашу УК/ТСЖ'));
  if (page === 'profile') {
    main.append(el('p', { class: 'eyebrow' }, 'ЛИЧНЫЕ ДАННЫЕ'), el('h1', {}, 'Мой профиль'), el('section', { class: 'card' }, [definitions([
      ['ФИО', [person.last_name, person.first_name, person.middle_name].filter(Boolean).join(' ')], ['Дата рождения', date(person.birth_date)], ['Телефоны', person.phones.join(', ')], ['Контактная почта', person.emails.join(', ')], ['Почта для входа', data.account.email],
    ]), el('p', { class: 'muted' }, 'Если данные неточны, обратитесь в УК/ТСЖ. Изменение контактной почты не меняет почту для входа.')]), el('section', { class: 'card narrow' }, [el('h2', {}, 'Изменить пароль'), el('p', { class: 'muted' }, 'После изменения пароля нужно будет войти заново на всех устройствах.'), form([field('Текущий пароль', 'current_password', { type: 'password', autocomplete: 'current-password', required: true }), ...passwordFields()], 'Изменить пароль', async (values) => {
      checkPasswords(values); await api('/auth/password', { method: 'PUT', body: { current_password: values.current_password, new_password: values.password } }); location.hash = 'login';
    })]));
    return;
  }
  const generationAtStart = generation;
  const [properties, meters, windows] = await Promise.all([api('/properties'), api('/meters'), api('/windows')]);
  if (generationAtStart !== generation) return;
  if (page === 'properties') {
    main.append(el('p', { class: 'eyebrow' }, 'ОБЪЕКТЫ В СОБСТВЕННОСТИ'), el('h1', {}, 'Моя недвижимость'), el('p', { class: 'muted' }, 'Ваши действующие права собственности. Процент в карточке — доля в помещении.'), el('div', { class: 'grid' }, properties.map(propertyCard)));
  } else if (page === 'meters') {
    main.append(el('p', { class: 'eyebrow' }, 'ВОДА И ЭЛЕКТРИЧЕСТВО'), el('h1', {}, 'Показания счётчиков'), el('p', { class: 'muted' }, 'Передавайте накопительные значения. Если расхода нет, повторите прежнее показание и оставьте комментарий.'));
    const selected = new URLSearchParams(location.hash.split('?')[1]).get('premises');
    const groups = selected ? properties.filter((p) => String(p.id) === selected) : properties;
    if (selected) main.append(link('Все объекты', 'meters'));
    for (const property of groups) {
      const list = meters.filter((m) => m.premises_id === property.id);
      const section = el('section', { class: 'meter-group' }, [el('h2', {}, `${property.kind_name} № ${property.number}`), el('p', { class: 'muted' }, property.address)]);
      const window = windows.find((w) => w.building_id === property.building_id);
      section.append(el('p', { class: `window ${windowOpen(window) ? 'open' : ''}` }, window ? `Приём за ${month(window.period)}: ${date(window.opens_on)} — ${date(window.closes_on)}${windowOpen(window) ? ' · открыт' : ' · закрыт'}` : 'Приём показаний пока не настроен. Обратитесь в УК/ТСЖ.'));
      if (!list.length) section.append(el('div', { class: 'card muted' }, 'Индивидуальные счётчики не заведены.'));
      const cards = el('div', { class: 'meter-grid' }); section.append(cards); main.append(section);
      await Promise.all(list.map(async (m) => {
        const card = el('article', { class: 'card meter-card' }, [el('h3', {}, resources[m.resource] || m.resource), el('p', { class: 'muted' }, `Счётчик № ${m.serial_number}`)]); cards.append(card);
        try { await renderMeter(card, m, window); } catch (e) { card.append(notice(errorMessage(e))); }
      }));
    }
  } else {
    const active = meters.filter((m) => m.active);
    main.append(el('section', { class: 'welcome' }, [el('div', {}, [el('p', { class: 'eyebrow' }, 'ВАШ ЛИЧНЫЙ КАБИНЕТ'), el('h1', {}, `Здравствуйте, ${person.first_name}!`), el('p', {}, 'Всё важное о вашем доме — здесь.'), el('a', { href: '#meters', class: 'button light' }, 'Передать показания →')]), el('div', { class: 'welcome-note' }, [el('strong', {}, String(active.length)), 'индивидуальных счётчиков'])]), el('div', { class: 'stats' }, [el('div', { class: 'card' }, [el('strong', {}, String(properties.length)), el('span', {}, 'Объектов недвижимости')]), el('div', { class: 'card' }, [el('strong', {}, String(active.length)), el('span', {}, 'Активных счётчиков')])]), el('div', { class: 'section-heading' }, [el('h2', {}, 'Пора передать показания'), link('Все счётчики →', 'meters')]));
    const summaries = el('div', { class: 'grid' }); main.append(summaries);
    await Promise.all(properties.map(async (p) => {
      const list = active.filter((m) => m.premises_id === p.id); if (!list.length) return;
      const window = windows.find((w) => w.building_id === p.building_id);
      const card = el('article', { class: 'card' }, [el('h3', {}, `${p.kind_name} № ${p.number}`), el('p', { class: 'muted' }, p.address)]); summaries.append(card);
      if (!windowOpen(window)) { card.append(el('p', {}, 'Приём показаний закрыт.'), link('Посмотреть историю →', `meters?premises=${p.id}`)); return; }
      try {
        const histories = await Promise.all(list.map((m) => api(`/meters/${m.id}/readings?limit=1`)));
        const submitted = histories.filter((rows) => rows.some((r) => r.period === window.period)).length;
        card.append(el('p', { class: 'badge' }, `${month(window.period)} · ${submitted} из ${list.length} передано`), el('p', { class: 'muted' }, `Приём до ${date(window.closes_on)}`), link(submitted === list.length ? 'Проверить показания →' : 'Передать показания →', `meters?premises=${p.id}`));
      } catch (e) { card.append(notice(errorMessage(e))); }
    }));
    if (!summaries.childElementCount) summaries.append(el('p', { class: 'muted' }, 'Активных индивидуальных счётчиков пока нет.'));
    main.append(el('div', { class: 'section-heading' }, [el('h2', {}, 'Моя недвижимость'), link('Все объекты →', 'properties')]), el('div', { class: 'grid' }, properties.map(propertyCard)));
  }
  if (!properties.length) main.append(notice('Действующие объекты не найдены. Обратитесь в УК/ТСЖ для проверки данных.'));
}
async function renderMeter(card, meter, window) {
  const readings = await api(`/meters/${meter.id}/readings?limit=200`);
  const current = window && readings.find((r) => r.period === window.period);
  card.append(el('div', { class: 'meter-value' }, [el('strong', {}, [1, 2, 3].slice(0, meter.tariffs).map((i) => number(meter[`last_t${i}`] ?? meter[`initial_t${i}`])).join(' / ')), el('span', {}, unit(meter.resource))]));
  card.append(el('p', { class: 'muted' }, meter.last_reading_date ? `Последнее показание: ${date(meter.last_reading_date)}` : 'Начальные показания при установке'));
  if (meter.verification_overdue) card.append(notice('Срок поверки истёк. Уточните порядок поверки в УК/ТСЖ.'));
  if (!meter.active) card.append(el('p', { class: 'badge' }, 'Счётчик выведен из работы или ещё не введён'));
  if (meter.active && windowOpen(window)) {
    if (current && !current.editable) card.append(el('p', { class: 'badge' }, 'Показания приняты'), el('p', { class: 'muted' }, 'Для исправления показаний другого собственника или сотрудника обратитесь в УК/ТСЖ.'));
    else {
      const previous = previousValues(meter, readings, window.period);
      const inputs = previous.map((value, i) => field(meter.tariffs === 1 ? `Текущее показание, ${unit(meter.resource)}` : `Тариф Т${i + 1}, ${unit(meter.resource)}`, `t${i + 1}`, { inputmode: 'decimal', required: true, value: current?.[`t${i + 1}`] ?? '', placeholder: `Предыдущее: ${number(value)}`, autocomplete: 'off' }));
      const comment = field('Комментарий (необязательно)', 'comment', { type: 'textarea', maxlength: 2000, value: current?.comment || '', placeholder: 'Например: мы на даче, расхода нет' });
      const preview = el('p', { class: 'consumption', 'aria-live': 'polite' }, 'Расход появится после ввода показаний.');
      const node = form([...inputs, comment], current ? 'Сохранить исправление' : 'Передать показания', async (data) => {
        const values = inputs.map((_, i) => parseReading(data[`t${i + 1}`])); consumption(values, previous, meter.coefficient);
        const saved = await api(`/meters/${meter.id}/readings`, { method: 'POST', body: { period: window.period, ...Object.fromEntries(values.map((v, i) => [`t${i + 1}`, v])), comment: data.comment.trim() || null, ...(current ? { revision: current.revision } : {}) } });
        const receipt = el('div', { class: 'receipt', role: 'status' }, [el('h3', {}, 'Показания приняты'), el('p', {}, `${month(window.period)} · ${values.map(number).join(' / ')} ${unit(meter.resource)}`), el('p', {}, `Расход: ${consumption(values, previous, meter.coefficient).map(number).join(' / ')} ${unit(meter.resource)}`), el('p', {}, `Принято ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(saved.updated_at))}`), data.comment ? el('p', {}, data.comment) : null, button('Обновить карточку', () => render())]);
        node.replaceWith(receipt);
      });
      const updatePreview = () => { try { preview.textContent = `Расход: ${consumption(inputs.map(({ control }) => parseReading(control.value)), previous, meter.coefficient).map(number).join(' / ')} ${unit(meter.resource)}`; } catch (e) { preview.textContent = e.message; } };
      for (const { control } of inputs) control.addEventListener('input', updatePreview);
      node.insertBefore(preview, node.lastElementChild);
      node.insertBefore(button('Расхода нет — повторить прежние', () => { inputs.forEach(({ control }, i) => { control.value = previous[i]; }); updatePreview(); }, 'button secondary'), comment.node);
      card.append(el('p', { class: 'badge' }, current ? 'Ваши показания приняты · можно исправить' : `За ${month(window.period)}`), node);
    }
  }
  const details = el('details', {}, el('summary', {}, 'История показаний'));
  const historyList = el('div', { class: 'history' }); details.append(historyList);
  let offset = 0;
  const appendReadings = (rows) => {
    for (const r of rows) historyList.append(el('div', { class: 'history-row' }, [el('strong', {}, month(r.period)), el('span', {}, [1, 2, 3].slice(0, meter.tariffs).map((i) => `Т${i}: ${number(r[`t${i}`])} · расход ${number(r[`delta_t${i}`])}`).join(' / ')), el('small', {}, `${date(r.reading_date)} · ${r.source === 'resident' ? 'Личный кабинет' : r.source === 'import' ? 'Импорт' : 'УК/ТСЖ'}`), r.comment ? el('p', {}, r.comment) : null]));
    offset += rows.length;
  };
  appendReadings(readings);
  if (!readings.length) historyList.append(el('p', { class: 'muted' }, 'Показаний пока нет.'));
  if (readings.length === 200) {
    const more = button('Загрузить ещё', async () => { more.disabled = true; try { const rows = await api(`/meters/${meter.id}/readings?limit=200&offset=${offset}`); appendReadings(rows); if (rows.length < 200) more.remove(); } catch (e) { historyList.append(notice(errorMessage(e))); } finally { more.disabled = false; } }, 'button secondary'); details.append(more);
  }
  const edits = el('div'); const loadEdits = button('История исправлений', async () => { loadEdits.disabled = true; try {
    const rows = await api(`/meters/${meter.id}/history`);
    edits.replaceChildren(...rows.map((r) => el('div', { class: 'history-row' }, [el('strong', {}, `${date(r.created_at)} · ${r.mine ? 'Вы' : 'Совладелец'}`), el('span', {}, `${r.before ? 'Исправление' : 'Передача'}: ${[1, 2, 3].slice(0, meter.tariffs).map((i) => `${r.before ? `${number(r.before[`t${i}`])} → ` : ''}${number(r.after[`t${i}`])}`).join(' / ')}`), r.after.comment ? el('p', {}, r.after.comment) : null])));
    if (!rows.length) edits.append(el('p', { class: 'muted' }, 'Исправлений через кабинет пока нет.'));
  } catch (e) { edits.replaceChildren(notice(errorMessage(e))); } finally { loadEdits.disabled = false; } }, 'button ghost'); details.append(loadEdits, edits); card.append(details);
}
async function render() {
  const myGeneration = ++generation;
  const route = location.hash.slice(1) || 'home';
  const page = route.split('?')[0];
  if (['login', 'register', 'forgot', 'set-password'].includes(page)) { authPage(route); return; }
  root.replaceChildren(el('p', { class: 'loading', role: 'status' }, 'Загрузка личного кабинета…'));
  try {
    const data = await api('/me'); if (myGeneration !== generation) return;
    await shell(['home', 'properties', 'meters', 'profile'].includes(page) ? page : 'home', data);
  } catch (e) {
    if (myGeneration !== generation) return;
    if (e.status === 401) { location.hash = 'login'; return; }
    root.replaceChildren(el('main', { class: 'auth-card' }, [brand(), notice(errorMessage(e)), button('Попробовать снова', render)]));
  }
}
window.addEventListener('hashchange', render);
render();
