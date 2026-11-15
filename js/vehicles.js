import { api } from './api.js';
import { el, button, field, notice } from './dom.js';
import { errorMessage } from './lib.js';

export async function renderVehicles(main) {
  main.append(el('h1', {}, 'Автомобили'), el('p', { class: 'muted' }, 'Добавьте автомобили в общий реестр собственника. Выберите нужные машины при подаче заявки на доступ.'));
  const status = el('div', { 'aria-live': 'polite' });
  const list = el('div', { class: 'gate-vehicle-registry' });
  const form = el('form', { class: 'form gate-vehicle-add' });
  const plate = field('Государственный номер', 'plate_number', { required: true, maxlength: 24, placeholder: 'а123аа777' });
  const brand = field('Марка автомобиля', 'brand', { maxlength: 80, placeholder: 'Например, Toyota' });
  const submit = el('button', { type: 'submit', class: 'button' }, 'Добавить автомобиль');
  form.append(el('h2', {}, 'Добавить автомобиль'), plate.node, brand.node, status, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submit.disabled = true;
    status.replaceChildren();
    try {
      await api('/gate-access/vehicles', { method: 'POST', body: { plate_number: plate.control.value.trim(), brand: brand.control.value.trim() } });
      plate.control.value = '';
      brand.control.value = '';
      await load();
    } catch (error) { status.replaceChildren(notice(errorMessage(error))); }
    finally { submit.disabled = false; }
  });
  main.append(form, list);

  async function load() {
    try {
      const result = await api('/gate-access/vehicles');
      list.replaceChildren(...(result.items.length ? result.items.map(renderRow) : [el('p', { class: 'empty-state' }, 'В реестре пока нет автомобилей.') ]));
    } catch (error) { list.replaceChildren(notice(errorMessage(error))); }
  }
  function renderRow(car) {
    const plateInput = field('Государственный номер', 'plate_number', { required: true, maxlength: 24, value: car.plate_number });
    const brandInput = field('Марка автомобиля', 'brand', { maxlength: 80, value: car.brand });
    const message = el('div', { 'aria-live': 'polite' });
    const save = button('Сохранить', async () => {
      if (!plateInput.control.reportValidity()) return;
      save.disabled = true;
      try {
        await api(`/gate-access/vehicles/${car.id}`, { method: 'PUT', body: { plate_number: plateInput.control.value.trim(), brand: brandInput.control.value.trim() } });
        await load();
      } catch (error) { message.replaceChildren(notice(errorMessage(error))); save.disabled = false; }
    }, 'text-button');
    const remove = button('Удалить автомобиль', async () => {
      if (!confirm(`Удалить автомобиль ${car.plate_number} из реестра и связанных заявок?`)) return;
      remove.disabled = true;
      try { await api(`/gate-access/vehicles/${car.id}`, { method: 'DELETE' }); await load(); }
      catch (error) { message.replaceChildren(notice(errorMessage(error))); remove.disabled = false; }
    }, 'text-button');
    return el('form', { class: 'property-card gate-vehicle-row', onsubmit: (event) => event.preventDefault() }, [plateInput.node, brandInput.node, message, el('div', { class: 'gate-actions' }, [save, remove])]);
  }
  await load();
}
