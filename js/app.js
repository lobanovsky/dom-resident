import { api } from './api.js';
import { el, link, button, notice, field, definitions } from './dom.js';
import { renderReadings, clearReadingDrafts } from './readings.js';
import { number, date, propertyMeters, errorMessage } from './lib.js';

const root = document.querySelector('#app');
let generation = 0;
let shellEvents = null;
let personId = null;

function brand(route = 'home') {
  return link(el('span', {}, 'Личный кабинет ТСН "МР17дом1"'), route, { class: 'brand' });
}
function form(fields, label, save) {
  const status = el('div', { 'aria-live': 'polite' });
  const submit = el('button', { class: 'button', type: 'submit' }, label);
  const node = el('form', { class: 'form' }, [...fields.map((f) => f.node), status, submit]);
  let busy = false;
  node.addEventListener('submit', async (event) => {
    event.preventDefault(); if (busy) return; busy = true;
    submit.disabled = true; status.replaceChildren();
    try { await save(Object.fromEntries(new FormData(node)), status); }
    catch (e) { status.replaceChildren(notice(errorMessage(e))); }
    finally { busy = false; submit.disabled = false; }
  });
  return node;
}
function passwordFields() {
  return [field('Пароль', 'password', { type: 'password', required: true, minlength: 8, autocomplete: 'new-password' }), field('Повторите пароль', 'confirm', { type: 'password', required: true, minlength: 8, autocomplete: 'new-password' })];
}
function checkPasswords(data) { if (data.password !== data.confirm) throw new Error('Пароли не совпадают.'); }
function authPage(route) {
  const [page, query] = route.split('?');
  const token = new URLSearchParams(query).get('token');
  if (page === 'set-password' && token) history.replaceState(null, '', '#set-password');
  const titles = { login: 'Вход в личный кабинет', register: 'Получить доступ', forgot: 'Восстановить пароль', 'set-password': 'Установить пароль' };
  const card = el('section', { class: 'auth-card' }, [brand(), ...(page === 'login' ? [] : [el('h1', {}, titles[page] || titles.login)])]);
  if (page === 'set-password') {
    if (!token) card.append(notice('Откройте ссылку из письма или запросите новую.'), link('Восстановить доступ', 'forgot'));
    else card.append(form(passwordFields(), 'Сохранить пароль', async (data) => {
      checkPasswords(data);
      await api('/auth/set-password', { method: 'POST', body: { token, password: data.password } });
      card.replaceChildren(brand(), el('h1', {}, 'Пароль установлен'), link('Перейти ко входу', 'login', { class: 'button' }));
    }));
  } else if (page === 'register' || page === 'forgot') {
    card.append(el('p', { class: 'muted' }, page === 'register' ? 'Укажите почту, подтверждённую в ТСЖ. На неё придёт ссылка для установки пароля.' : 'Укажите почту, с которой входите в кабинет.'), form([
      field('Электронная почта', 'email', { type: 'email', required: true, autocomplete: 'email', maxlength: 254 }),
    ], 'Получить письмо', async (data, status) => {
      const result = await api(`/auth/${page === 'register' ? 'register' : 'forgot-password'}`, { method: 'POST', body: data });
      status.replaceChildren(notice(result.message, true), el('p', { class: 'muted' }, 'Если письма нет, проверьте «Спам» или уточните контакты в ТСЖ.'));
    }), link('Вернуться ко входу', 'login'));
  } else {
    card.append(form([
      field('Электронная почта', 'email', { type: 'email', required: true, autocomplete: 'username' }),
      field('Пароль', 'password', { type: 'password', required: true, autocomplete: 'current-password' }),
    ], 'Войти', async (data) => { await api('/auth/login', { method: 'POST', body: data }); location.hash = 'home'; }), el('div', { class: 'auth-links' }, [link('Получить доступ', 'register'), link('Забыли пароль?', 'forgot')]), el('p', { class: 'muted support-contact' }, ['Поддержка: ', el('a', { href: 'mailto:dom@mr17dom1.ru' }, 'dom@mr17dom1.ru')]));
  }
  root.replaceChildren(el('main', { class: 'auth-layout' }, card));
}

function shell(page, data, hasMeters, defaultRoute) {
  const main = el('main', { class: 'main', id: 'main-content', tabindex: '-1' });
  const sidebar = el('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Основное меню' });
  const mobile = matchMedia('(max-width: 760px)');
  let open = false;
  const toggle = button('☰', () => setOpen(!open), 'menu-toggle');
  toggle.setAttribute('aria-label', 'Открыть меню'); toggle.setAttribute('aria-controls', 'sidebar'); toggle.setAttribute('aria-expanded', 'false');
  const close = button('×', () => setOpen(false), 'menu-close'); close.setAttribute('aria-label', 'Закрыть меню');
  const backdrop = button('', () => setOpen(false), 'menu-backdrop'); backdrop.setAttribute('aria-label', 'Закрыть меню');
  const nav = [['meters', 'Показания'], ['properties', 'Недвижимость'], ['profile', 'Профиль']].filter(([route]) => route !== 'meters' || hasMeters);
  sidebar.append(el('div', { class: 'sidebar-heading' }, [brand(defaultRoute), close]), el('nav', {}, nav.map(([route, title]) => link(title, route, {
    class: page === route ? 'nav-link active' : 'nav-link', 'aria-current': page === route ? 'page' : null, onclick: () => setOpen(false, false),
  }))));
  const fullName = [data.person.last_name, data.person.first_name, data.person.middle_name].filter(Boolean).join(' ');
  sidebar.append(el('div', { class: 'sidebar-user' }, [el('span', { class: 'user-name', title: fullName }, [data.person.first_name, data.person.last_name].filter(Boolean).join(' ')), button('Выйти', async () => {
    try { await api('/auth/logout', { method: 'POST', body: {} }); clearReadingDrafts(); personId = null; location.hash = 'login'; }
    catch (e) { main.prepend(notice(errorMessage(e))); }
  }, 'text-button logout')]));
  const container = el('div', { class: 'shell' }, [sidebar, backdrop, el('header', { class: 'mobile-header' }, [toggle, el('span', {}, 'Личный кабинет ТСН "МР17дом1"')]), main]);
  function setOpen(value, restore = true) {
    open = value && mobile.matches;
    container.classList.toggle('menu-open', open); document.body.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    sidebar.inert = mobile.matches && !open;
    if (mobile.matches) sidebar.setAttribute('aria-hidden', String(!open)); else sidebar.removeAttribute('aria-hidden');
    if (open) { sidebar.setAttribute('role', 'dialog'); sidebar.setAttribute('aria-modal', 'true'); close.focus(); }
    else { sidebar.removeAttribute('role'); sidebar.removeAttribute('aria-modal'); if (restore && mobile.matches) toggle.focus(); }
  }
  document.addEventListener('keydown', (event) => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    if (event.key === 'Tab') {
      const nodes = [...sidebar.querySelectorAll('a[href], button:not([disabled])')].filter((n) => n.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }, { signal: shellEvents.signal });
  mobile.addEventListener('change', () => setOpen(false, false), { signal: shellEvents.signal });
  root.replaceChildren(el('a', { href: '#main-content', class: 'skip', onclick: (e) => { e.preventDefault(); main.focus(); } }, 'К содержимому'), container);
  setOpen(false, false);
  return main;
}

function propertyCard(p, meters) {
  const own = propertyMeters(p, meters);
  const active = own.some((m) => m.active);
  const extra = [['Этаж', p.floor], ['Подъезд', p.entrance], ['Жилая площадь', p.living_area == null ? null : `${number(p.living_area)} м²`], ['Комнат', p.rooms], ['Кадастровый номер', p.cadastral_number]];
  return el('article', { class: 'property-card' }, [el('h2', {}, `${p.kind_name} № ${p.number}`), definitions([
    ['Площадь', p.total_area == null ? null : `${number(p.total_area)} м²`], ['Доля собственности', `${p.share_num}/${p.share_den} (${number(p.share_num / p.share_den * 100)}%)`],
  ]), extra.some(([, value]) => value != null && value !== '') ? el('details', { class: 'property-details' }, [el('summary', {}, 'Подробнее'), definitions(extra)]) : null, own.length ? link(active ? 'Счётчики и показания' : 'История счётчиков', `meters?premises=${p.id}`, { class: 'property-meters-link' }) : null]);
}
function renderProperties(main, properties, meters) {
  main.append(el('h1', {}, 'Недвижимость'));
  const buildings = [...new Set(properties.map((p) => p.building_id))];
  for (const id of buildings) {
    const items = properties.filter((p) => p.building_id === id);
    main.append(el('section', { class: 'property-building' }, [el('p', { class: 'address-line' }, items[0].address), el('div', { class: 'property-grid' }, items.map((p) => propertyCard(p, meters)))]));
  }
  if (!properties.length) main.append(el('p', { class: 'empty-state' }, 'Действующие объекты не найдены. Обратитесь в ТСЖ для проверки данных.'));
}
function renderProfile(main, data) {
  const p = data.person;
  main.append(el('h1', {}, 'Профиль'), el('section', { class: 'profile-card' }, [definitions([
    ['ФИО', [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(' ')], ['Дата рождения', p.birth_date ? date(p.birth_date) : null], ['Телефоны', (p.phones || []).join(', ')], ['Почта для входа', data.account.email], ['Другие адреса почты', (p.emails || []).filter((email) => email.toLowerCase() !== data.account.email.toLowerCase()).join(', ')],
  ]), el('p', { class: 'muted' }, ['Для исправления персональных данных обратитесь в ТСЖ. Поддержка: ', el('a', { href: 'mailto:dom@mr17dom1.ru' }, 'dom@mr17dom1.ru')])]), el('details', { class: 'password-details' }, [el('summary', {}, 'Изменить пароль'), form([
    field('Текущий пароль', 'current_password', { type: 'password', autocomplete: 'current-password', required: true }), ...passwordFields(),
  ], 'Изменить пароль', async (values) => {
    checkPasswords(values); await api('/auth/password', { method: 'PUT', body: { current_password: values.current_password, new_password: values.password } }); clearReadingDrafts(); location.hash = 'login';
  })]));
}
async function render() {
  const id = ++generation;
  shellEvents?.abort(); shellEvents = new AbortController(); document.body.classList.remove('menu-open');
  const route = location.hash.slice(1) || 'home'; const requested = route.split('?')[0];
  if (['login', 'register', 'forgot', 'set-password'].includes(requested)) { clearReadingDrafts(); authPage(route); return; }
  root.replaceChildren(el('p', { class: 'loading', role: 'status' }, 'Загрузка…'));
  try {
    const me = await api('/me'); if (id !== generation) return;
    if (personId !== me.person.id) { clearReadingDrafts(); personId = me.person.id; }
    const [properties, meters, windows] = await Promise.all([api('/properties'), api('/meters'), api('/windows')]);
    if (id !== generation) return;
    const defaultPage = meters.some((m) => m.active) ? 'meters' : 'properties';
    const page = ['meters', 'properties', 'profile'].includes(requested) ? requested : defaultPage;
    if (requested === 'home') history.replaceState(null, '', `#${page}`);
    const main = shell(page, me, meters.length > 0, defaultPage);
    if (page === 'profile') renderProfile(main, me);
    else if (page === 'properties') renderProperties(main, properties, meters);
    else await renderReadings(main, properties, meters, windows, new URLSearchParams(route.split('?')[1]).get('premises'));
  } catch (e) {
    if (id !== generation) return;
    if (e.status === 401) { clearReadingDrafts(); personId = null; location.hash = 'login'; return; }
    root.replaceChildren(el('main', { class: 'auth-card' }, [brand(), notice(errorMessage(e)), button('Повторить', render)]));
  }
}
window.addEventListener('hashchange', render);
render();
