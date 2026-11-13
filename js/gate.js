import { api } from './api.js';
import { el, button, notice, field, definitions } from './dom.js';
import { date, errorMessage } from './lib.js';
import { trackForm, markFormSaved } from './formState.js';

export const gateStatuses = {
  pending: 'На проверке',
  approved: 'Одобрено',
  rejected: 'Отклонено',
  revoked: 'Отозвано',
  cancelled: 'Отменено',
  expired: 'Истёк срок',
  ineligible: 'Нет права на объект',
};
export const gateRelations = {
  owner: 'Собственник',
  relative: 'Родственник',
  tenant: 'Арендатор',
  guest: 'Гость',
  service: 'Обслуживание / доставка',
};
export const gateZones = { courtyard: 'Двор', parking: 'Паркинг' };
export const gatePropertyLabel = (p) =>
  `${(p.kind || p.premises_kind) === 'parking_space' ? 'Машиноместо' : 'Квартира'} № ${p.number || p.premises_number}`;
const phoneText = (value) => `+${value}`;
function selectField(label, name, options) {
  const control = el(
    'select',
    { name, required: true, 'aria-label': label },
    options.map(([value, title]) => el('option', { value }, title)),
  );
  return { control, node: el('label', { class: 'field' }, [el('span', {}, label), control]) };
}
export async function renderGateAccess(main, me, signal) {
  let properties = [],
    offset = 0,
    version = 0;
  const status = selectField('Показать', 'status', [['', 'Все заявки и доступы'], ...Object.entries(gateStatuses)]);
  const list = el('div', { class: 'gate-list' });
  const error = el('div', { 'aria-live': 'polite' });
  const more = button('Показать ещё', () => {
    offset += 50;
    load(true);
  });
  more.hidden = true;
  const create = button('Подать заявку', () => openCreate());
  create.disabled = true;
  const refresh = button(
    'Обновить список',
    () => {
      offset = 0;
      load();
    },
    'text-button',
  );
  status.control.addEventListener('change', () => {
    offset = 0;
    load();
  });
  main.append(
    el('div', { class: 'gate-heading' }, [el('h1', {}, 'Двор и паркинг'), create]),
    el('p', { class: 'muted' }, 'Выдавайте доступ только нужным людям. Когда он больше не нужен — отзовите его здесь.'),
    el('div', { class: 'gate-filters' }, [status.node, refresh]),
    error,
    list,
    more,
  );
  try {
    const result = await api('/gate-access/properties');
    properties = result.items;
    create.disabled = !properties.length;
    if (!properties.length)
      error.append(notice('Для заявки нужна действующая собственность на квартиру или машиноместо.'));
  } catch (e) {
    error.replaceChildren(notice(errorMessage(e)));
  }
  async function load(append = false) {
    const request = ++version;
    more.disabled = true;
    more.hidden = true;
    try {
      const { items } = await api(
        `/gate-access?limit=50&offset=${offset}${status.control.value ? `&status=${encodeURIComponent(status.control.value)}` : ''}`,
      );
      if (request !== version || !main.isConnected) return;
      if (!append) list.replaceChildren();
      if (!items.length && !append) list.append(el('p', { class: 'empty-state' }, 'Заявок пока нет.'));
      list.append(...items.map(card));
      more.hidden = items.length < 50;
    } catch (e) {
      error.replaceChildren(notice(errorMessage(e)));
    } finally {
      more.disabled = false;
    }
  }
  function card(r) {
    const history = el('details', {}, el('summary', {}, 'История заявки'));
    let loaded = false;
    history.addEventListener('toggle', async () => {
      if (!history.open || loaded) return;
      loaded = true;
      try {
        const { items } = await api(`/gate-access/${r.id}/events`);
        history.append(
          ...items.map((e) =>
            el(
              'p',
              { class: 'muted' },
              `${new Date(e.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} · ${{ submitted: 'Заявка подана', approved: 'Одобрено', rejected: 'Отклонено', revoked: 'Отозвано', cancelled: 'Отменено' }[e.action]} · ${e.actor_role === 'resident' ? 'Собственник' : 'Охрана / администрация'}${e.note ? `: ${e.note}` : ''}`,
            ),
          ),
        );
      } catch (e) {
        loaded = false;
        history.append(notice(errorMessage(e)));
      }
    });
    const message = el('div', { 'aria-live': 'polite' });
    const actions = [];
    for (const [action, label] of r.status === 'pending'
      ? [['cancel', 'Отменить заявку']]
      : r.status === 'approved'
        ? [['revoke', 'Отозвать доступ']]
        : []) {
      const control = button(
        label,
        async () => {
          if (!confirm(`${label}: ${r.recipient_name}, ${phoneText(r.phone)}?`)) return;
          control.disabled = true;
          try {
            await api(`/gate-access/${r.id}/action`, { method: 'POST', body: { action, note: '' } });
            offset = 0;
            await load();
          } catch (e) {
            message.replaceChildren(notice(errorMessage(e)));
            control.disabled = false;
          }
        },
        'text-button',
      );
      actions.push(control);
    }
    if (!['pending', 'approved'].includes(r.effective_status))
      actions.push(button('Новая заявка на основе этой', () => openCreate(r), 'text-button'));
    return el('article', { class: 'property-card gate-card' }, [
      el('div', { class: 'gate-heading' }, [
        el('h2', {}, r.recipient_name),
        el('span', { class: `gate-status gate-status-${r.effective_status}` }, gateStatuses[r.effective_status]),
      ]),
      definitions([
        ['Телефон', phoneText(r.phone)],
        ['Куда', gateZones[r.zone]],
        ['Объект', gatePropertyLabel(r)],
        ['Кем приходится', gateRelations[r.relation]],
        ['Автомобиль', [r.vehicle_plate, r.vehicle_brand].filter(Boolean).join(' · ')],
        ['Редкие заезды', r.occasional_vehicle ? 'Да (такси, доставка)' : null],
        ['Срок', r.valid_until ? `до ${date(r.valid_until)} включительно` : 'Без ограничения'],
      ]),
      el('p', { class: 'muted' }, r.address),
      r.comment ? el('p', {}, r.comment) : null,
      r.review_note ? el('p', { class: 'gate-review-note' }, r.review_note) : null,
      r.effective_status === 'ineligible'
        ? notice('Право собственности на этот объект больше не подтверждено. Доступ не действует.')
        : null,
      history,
      message,
      el('div', { class: 'gate-actions' }, actions),
    ]);
  }
  function openCreate(original = null) {
    if (!properties.length) return;
    const availableZones = [...new Set(properties.map((p) => p.zone))];
    const zone = selectField(
      'Куда нужен доступ',
      'zone',
      availableZones.map((z) => [z, gateZones[z]]),
    );
    if (original && availableZones.includes(original.zone)) zone.control.value = original.zone;
    const property = selectField('Объект недвижимости', 'premises_id', []);
    const updateProperties = () => {
      const choices = properties.filter((p) => p.zone === zone.control.value);
      property.control.replaceChildren(
        ...choices.map((p) => el('option', { value: p.id }, `${gatePropertyLabel(p)} · ${p.address}`)),
      );
      if (original && choices.some((p) => p.id === original.premises_id)) property.control.value = original.premises_id;
      property.control.disabled = choices.length === 1;
    };
    zone.control.addEventListener('change', updateProperties);
    updateProperties();
    const phone = field('Телефон для доступа', 'phone', {
      type: 'tel',
      required: true,
      autocomplete: 'tel',
      maxlength: 30,
      value: original?.phone || me.person.phones?.[0] || '',
      placeholder: '+7 999 123-45-67',
    });
    const name = field('Имя получателя доступа', 'recipient_name', {
      required: true,
      maxlength: 120,
      value: original?.recipient_name || [me.person.first_name, me.person.last_name].filter(Boolean).join(' '),
    });
    const relation = selectField('Кто будет пользоваться', 'relation', Object.entries(gateRelations));
    relation.control.value = original?.relation || 'owner';
    const plate = field('Номер автомобиля', 'vehicle_plate', { maxlength: 24, value: original?.vehicle_plate || '' });
    const brand = field('Марка автомобиля', 'vehicle_brand', { maxlength: 80, value: original?.vehicle_brand || '' });
    const occasional = field('Редкие заезды: такси, доставка и т. п.', 'occasional_vehicle', { type: 'checkbox' });
    occasional.control.checked = original?.occasional_vehicle || false;
    const until = field('Доступ до даты включительно (необязательно)', 'valid_until', { type: 'date' });
    const comment = field('Комментарий для охраны (необязательно)', 'comment', { type: 'textarea', maxlength: 500 });
    const message = el('div', { 'aria-live': 'polite' });
    const submit = el('button', { type: 'submit', class: 'button' }, 'Отправить на проверку');
    const dialog = el('dialog', { class: 'gate-dialog', 'aria-labelledby': 'gate-dialog-title' });
    let busy = false;
    const close = () => {
      if (busy) return;
      dialog.close();
      dialog.remove();
    };
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    const form = el(
      'form',
      {
        class: 'form',
        onsubmit: async (e) => {
          e.preventDefault();
          if (busy) return;
          busy = true;
          submit.disabled = true;
          message.replaceChildren();
          try {
            await api('/gate-access', {
              method: 'POST',
              body: {
                premises_id: Number(property.control.value),
                zone: zone.control.value,
                phone: phone.control.value.trim(),
                recipient_name: name.control.value.trim(),
                relation: relation.control.value,
                vehicle_plate: plate.control.value.trim(),
                vehicle_brand: brand.control.value.trim(),
                occasional_vehicle: occasional.control.checked,
                valid_until: until.control.value || null,
                comment: comment.control.value.trim(),
              },
            });
            markFormSaved(form);
            busy = false;
            close();
            offset = 0;
            await load();
          } catch (err) {
            message.replaceChildren(notice(errorMessage(err)));
          } finally {
            busy = false;
            submit.disabled = false;
          }
        },
      },
      [
        zone.node,
        property.node,
        phone.node,
        name.node,
        relation.node,
        el('details', { class: 'gate-extras' }, [
          el('summary', {}, 'Автомобиль и редкие заезды (необязательно)'),
          plate.node,
          brand.node,
          occasional.node,
        ]),
        el('details', { class: 'gate-extras' }, [
          el('summary', {}, 'Срок и комментарий (необязательно)'),
          until.node,
          comment.node,
        ]),
        message,
        submit,
        button('Отмена', close, 'text-button'),
      ],
    );
    dialog.append(
      el('h2', { id: 'gate-dialog-title' }, 'Заявка на доступ'),
      el('p', { class: 'muted' }, 'Доступ выдаётся после проверки охраной.'),
      form,
    );
    signal?.addEventListener(
      'abort',
      () => {
        dialog.close();
        dialog.remove();
      },
      { once: true },
    );
    document.body.append(dialog);
    trackForm(form);
    dialog.showModal();
  }
  await load();
}
