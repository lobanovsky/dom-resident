import {
  groupGateRequests,
  formatGatePhone,
  bindGatePhone,
  gateAccessNote,
  gateVehicles,
  gateVehicleLabel,
  rejectedLast,
  ownersFirst,
} from './gateForm.js';
import { api } from './api.js';
import { el, button, notice, field, definitions } from './dom.js';
import { date, errorMessage } from './lib.js';
import { trackForm, markFormSaved } from './formState.js';

export const gateStatuses = {
  pending: 'На проверке',
  approved: 'Одобрено',
  revoke_requested: 'Ожидает удаления с устройства',
  rejected: 'Отклонено',
};
export const gateRelations = {
  owner: 'Собственник',
  relative: 'Родственник',
  tenant: 'Арендатор',
  guest: 'Гость',
};
export const gatePropertyLabel = (p) =>
  `${{ parking_space: 'Машиноместо', commercial: 'Коммерческое помещение' }[p.kind || p.premises_kind] || 'Квартира'} ${p.number || p.premises_number}`;
const phoneText = (value) => (/^7\d{10}$/.test(value) ? formatGatePhone(value) : `+${value}`);
const statusLabel = (value) => gateStatuses[value];
export async function renderGateAccess(main, me, signal) {
  let properties = [],
    offset = 0,
    version = 0,
    loadedGroups = [];
  const includeRejected = el('input',{type:'checkbox','aria-label':'Показать отклонённые'});
  const rejectedFilter = el('label',{class:'gate-rejected-filter'},[includeRejected,el('span',{},'Показать отклонённые')]);
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
    async () => {
      offset = 0;
      refresh.disabled = true;
      refresh.textContent = 'Обновляем…';
      const loaded = await load();
      if (loaded && properties.length) error.replaceChildren(notice('Список обновлён.', true));
      refresh.disabled = false;
      refresh.textContent = 'Обновить список';
    },
    'text-button',
  );
  includeRejected.addEventListener('change', () => {
    offset = 0;
    load();
  });
  main.append(
    el('div', { class: 'gate-heading' }, [el('h1', {}, 'Двор и паркинг'), create]),
    el('p', { class: 'muted' }, 'Выдавайте доступ только нужным людям. Когда он больше не нужен — отзовите его здесь.'),
    el('div', { class: 'gate-filters' }, [rejectedFilter, refresh]),
    error,
    list,
    more,
  );
  try {
    const result = await api('/gate-access/properties');
    properties = result.items;
    create.disabled = !properties.length;
    if (!properties.length)
      error.append(
        notice('Для заявки нужна действующая собственность на квартиру, коммерческое помещение или машиноместо.'),
      );
  } catch (e) {
    error.replaceChildren(notice(errorMessage(e)));
  }
  async function load(append = false) {
    const request = ++version;
    more.disabled = true;
    more.hidden = true;
    try {
      const result = await api(
        `/gate-access?limit=50&offset=${offset}${includeRejected.checked ? '&include_rejected=true' : ''}`,
      );
      const items = groupGateRequests(result.items);
      if (request !== version || !main.isConnected) return false;
      if (properties.length) error.replaceChildren();
      if (!append) loadedGroups = [];
      loadedGroups.push(...items);
      const ordered = ownersFirst(rejectedLast(loadedGroups));
      const courtyard = ordered.filter((group) => group.items.some((item) => item.zone === 'courtyard'));
      const parking = ordered.filter((group) => group.items.some((item) => item.zone === 'parking'));
      const sections = [
        zoneSection('courtyard', '🏠', 'Двор', courtyard),
        zoneSection('parking', '🅿️', 'Паркинг', parking),
      ].filter(Boolean);
      list.replaceChildren(...(sections.length ? sections : [el('p', { class: 'empty-state' }, 'Заявок пока нет.')]));
      more.hidden = items.length < 50;
      return true;
    } catch (e) {
      error.replaceChildren(notice(errorMessage(e)));
      return false;
    } finally {
      more.disabled = false;
    }
  }
  function zoneSection(zone, icon, title, groups) {
    if (!groups.length) return null;
    return el('section', { class: 'gate-zone-section' }, [
      el('h2', {}, [el('span', { 'aria-hidden': 'true' }, icon), title]),
      el('div', { class: 'gate-list' }, groups.map((group) => card(group, zone))),
    ]);
  }

  function card(r, zone) {
    const message = el('div', { 'aria-live': 'polite' });
    const actions = [];
    const canManage = Number(r.person_id) === Number(me.person.id);
    for (const [action, label] of canManage && r.status === 'pending'
      ? [['cancel', 'Отменить заявку']]
      : canManage && r.status === 'approved'
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
    if (canManage && r.display_status === 'rejected')
      actions.push(button('Новая заявка на основе этой', () => openCreate(r), 'text-button'));
    else if (canManage && ['pending', 'approved'].includes(r.display_status))
      actions.unshift(button('Изменить данные', () => openEdit(r), 'text-button'));
    const relation = gateRelations[r.relation === 'service' ? 'guest' : r.relation];
    const items = r.items.filter((item) => item.zone === zone);
    const otherZoneItems = r.items.some((item) => item.zone !== zone);
    const objectList = items.map((item) => {
      const note = ['partial', 'attention'].includes(r.effective_status) ? gateAccessNote(item) : '';
      return gatePropertyLabel(item) + (note ? ` — ${note}` : '');
    }).join(', ');
    return el('article', { class: 'property-card gate-card' }, [
      el('div', { class: 'gate-heading' }, [
        el('div', { class: 'gate-card-person' }, [
          el('h2', {}, r.recipient_name),
          el('span', { class: 'gate-relation' }, relation),
        ]),
      ]),
      el('div', {
        class: `gate-phone gate-phone-${r.display_status}`,
        'aria-label': `${phoneText(r.phone)} · ${statusLabel(r.display_status)}`,
      }, phoneText(r.phone)),
      el('div', { class: 'gate-card-content' }, [
        el('div', { class: 'gate-zones' }, [
          el('p', { class: 'gate-card-property' }, objectList),
          otherZoneItems ? el('p', { class: 'muted' }, 'Заявка также включает объект другой зоны; действия относятся ко всей заявке.') : null,
        ]),
        definitions([
          ['Автомобили', gateVehicles(r).map(gateVehicleLabel).join('; ')],
          ['Редкие заезды', r.occasional_vehicle ? 'Да' : null],
          ['Срок', r.valid_until ? `до ${date(r.valid_until)} включительно` : null],
        ]),
      ]),
      message,
      el('div', { class: 'gate-actions' }, actions),
    ]);
  }

  async function openEdit(original) {
    let vehicles;
    try { vehicles = (await api('/gate-access/vehicles')).items; }
    catch (error) { list.prepend(notice(errorMessage(error))); return; }
    const name = field('Имя получателя доступа', 'recipient_name', {
      required: true,
      maxlength: 120,
      value: original.recipient_name,
    });
    const relation = el('select', { name: 'relation', required: true, 'aria-label': 'Кто будет пользоваться' }, [
      ['owner', 'Собственник'],
      ['tenant', 'Арендатор'],
      ['relative', 'Родственник'],
      ['guest', 'Гость'],
    ].map(([value, label]) =>
      el('option', { value, selected: (original.relation === 'service' ? 'guest' : original.relation) === value }, label),
    ));
    const relationField = el('label', { class: 'field' }, [el('span', {}, 'Кто будет пользоваться?'), relation]);
    const noCar = el('input', { type: 'checkbox', checked: !!original.no_personal_vehicle });
    const selected = new Set(gateVehicles(original).map((car) => car.id).filter(Boolean));
    const carHost = el('div', { class: 'gate-car-rows' });
    const message = el('div', { 'aria-live': 'polite' });
    const submit = el('button', { type: 'submit', class: 'button' }, 'Сохранить');
    let modal;
    const drawVehicles = () => {
      carHost.replaceChildren(...vehicles.map((car) => {
        const control = el('input', { type: 'checkbox', value: car.id, checked: selected.has(car.id), disabled: noCar.checked });
        control.addEventListener('change', () => {
          if (control.checked && selected.size >= 10) { control.checked = false; message.replaceChildren(notice('Можно выбрать не более 10 автомобилей.')); return; }
          control.checked ? selected.add(car.id) : selected.delete(car.id);
        });
        return el('label', { class: 'gate-choice' }, [control, el('span', {}, gateVehicleLabel(car))]);
      }));
      if (!vehicles.length) carHost.append(el('p', { class: 'muted' }, 'В реестре нет автомобилей.'));
    };
    drawVehicles();
    noCar.addEventListener('change', () => drawVehicles());
    const form = el('form', { class: 'form', onsubmit: async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      submit.disabled = true;
      message.replaceChildren();
      try {
        await api(`/gate-access/${original.id}`, {
          method: 'PUT',
          body: {
            recipient_name: name.control.value.trim(),
            relation: relation.value,
            vehicle_ids: noCar.checked ? [] : [...selected],
            no_personal_vehicle: noCar.checked,
          },
        });
        markFormSaved(form);
        modal.close();
        offset = 0;
        await load();
      } catch (error) {
        message.replaceChildren(notice(errorMessage(error)));
      } finally {
        submit.disabled = false;
      }
    } }, [
      name.node,
      relationField,
      el('fieldset', { class: 'gate-choice-group' }, [
        el('legend', {}, 'Автомобили'),
        carHost,
        el('label', { class: 'gate-choice' }, [noCar, el('span', {}, 'Нет личного автомобиля')]),
      ]),
      message,
      submit,
    ]);
    const dialog = el('dialog', { class: 'gate-dialog', 'aria-labelledby': 'gate-edit-title' }, [
      el('h2', { id: 'gate-edit-title' }, 'Изменить данные заявки'),
      form,
    ]);
    document.body.append(dialog);
    dialog.showModal();
    modal = { close: () => { dialog.close(); dialog.remove(); } };
    form.append(button('Отмена', modal.close, 'text-button'));
    trackForm(form);
  }

  async function openCreate(original = null) {
    if (!properties.length) return;
    let registry;
    try { registry = (await api('/gate-access/vehicles')).items; }
    catch (e) { error.replaceChildren(notice(errorMessage(e))); return; }
    const selected = new Set(
      original?.items?.map((r) => r.premises_id) ||
        (original ? [original.premises_id] : properties.length === 1 ? [properties[0].id] : []),
    );
    const choices = properties.map((p) => {
      const control = el('input', { type: 'checkbox', name: 'premises_ids', value: p.id, checked: selected.has(p.id) });
      return { control, node: el('label', { class: 'gate-choice' }, [control, el('span', {}, gatePropertyLabel(p))]) };
    });
    const validateProperties = () =>
      choices[0].control.setCustomValidity(
        choices.some((choice) => choice.control.checked) ? '' : 'Выберите хотя бы один объект недвижимости.',
      );
    for (const choice of choices) choice.control.addEventListener('change', validateProperties);
    validateProperties();
    const propertyChoices = el('fieldset', { class: 'gate-choice-group' }, [
      el('legend', {}, 'Объекты недвижимости'),
      ...choices.map((choice) => choice.node),
    ]);
    const phone = field('Телефон для доступа', 'phone', {
      type: 'tel',
      required: true,
      autocomplete: 'tel',
      maxlength: 16,
      inputmode: 'numeric',
      pattern: '[+]7 [0-9]{3} [0-9]{3} [0-9]{2} [0-9]{2}',
      value: original?.phone || me.person.phones?.[0] || '',
      placeholder: '+7 926 793 63 63',
    });
    const name = field('Имя получателя доступа', 'recipient_name', {
      required: true,
      maxlength: 120,
      value: original?.recipient_name || [me.person.first_name, me.person.last_name].filter(Boolean).join(' '),
    });
    bindGatePhone(phone.control);
    const relationValue = original?.relation === 'service' ? 'guest' : original?.relation || 'owner';
    const relationOptions = [
      ['owner', 'Собственник'],
      ['tenant', 'Арендатор'],
      ['relative', 'Родственник'],
      ['guest', 'Гость'],
    ];
    const relation = el('fieldset', { class: 'gate-choice-group gate-relations' }, [
      el('legend', {}, 'Кто будет пользоваться?'),
      ...relationOptions.map(([value, title]) =>
        el('label', { class: 'gate-choice' }, [
          el('input', { type: 'radio', name: 'relation', value, checked: value === relationValue, required: true }),
          el('span', {}, title),
        ]),
      ),
    ]);
    const noCar = el('input', {
      type: 'checkbox',
      name: 'no_personal_vehicle',
      checked: original?.no_personal_vehicle || false,
    });
    const carHost = el('div', { class: 'gate-car-rows' });
    const selectedCars = new Set(gateVehicles(original).map((car) => car.id).filter(Boolean));
    const drawCars = () => {
      carHost.replaceChildren(...registry.map((car) => {
        const control = el('input', { type: 'checkbox', value: car.id, checked: selectedCars.has(car.id), disabled: noCar.checked });
        control.addEventListener('change', () => {
          if (control.checked && selectedCars.size >= 10) { control.checked = false; message.replaceChildren(notice('Можно выбрать не более 10 автомобилей.')); return; }
          control.checked ? selectedCars.add(car.id) : selectedCars.delete(car.id);
        });
        return el('label', { class: 'gate-choice' }, [control, el('span', {}, gateVehicleLabel(car))]);
      }));
      if (!registry.length) carHost.append(el('p', { class: 'muted' }, 'В реестре пока нет автомобилей.'));
    };
    drawCars();
    noCar.addEventListener('change', drawCars);
    const newPlate = field('Государственный номер', 'new_vehicle_plate', { required: true, maxlength: 24, placeholder: 'а123аа777' });
    const newBrand = field('Марка автомобиля', 'new_vehicle_brand', { maxlength: 80 });
    const addCarButton = button('Добавить в реестр', async () => {
      if (!newPlate.control.reportValidity()) return;
      addCarButton.disabled = true;
      try {
        const car = await api('/gate-access/vehicles', { method: 'POST', body: { plate_number: newPlate.control.value.trim(), brand: newBrand.control.value.trim() } });
        registry.push(car);
        selectedCars.add(car.id);
        newPlate.control.value = ''; newBrand.control.value = '';
        drawCars();
      } catch (e) { message.replaceChildren(notice(errorMessage(e))); }
      finally { addCarButton.disabled = false; }
    }, 'text-button');
    const car = el('fieldset', { class: 'gate-choice-group' }, [
      el('legend', {}, 'Автомобили'),
      carHost,
      newPlate.node,
      newBrand.node,
      addCarButton,
      el('label', { class: 'gate-choice' }, [noCar, el('span', {}, 'Нет личного автомобиля')]),
    ]);
    const comment = field('Комментарий для охраны', 'comment', {
      type: 'textarea',
      maxlength: 500,
      value: original?.comment || '',
    });
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
            await api('/gate-access/batch', {
              method: 'POST',
              body: {
                premises_ids: choices
                  .filter((choice) => choice.control.checked)
                  .map((choice) => Number(choice.control.value)),
                phone: phone.control.value.trim(),
                recipient_name: name.control.value.trim(),
                relation: form.querySelector('input[name=relation]:checked').value,
                vehicle_ids: noCar.checked ? [] : [...selectedCars],
                no_personal_vehicle: noCar.checked,
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
        propertyChoices,
        phone.node,
        name.node,
        relation,
        car,
        comment.node,
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
