import { api } from './api.js';
import { el, button, notice, field, link } from './dom.js';
import { meterIcon } from './meterIcon.js';
import { resources, unit, number, date, dateTime, month, windowOpen, windowMessage, previousValues, consumption, parseReading, buildBatch, propertyMeters, errorMessage } from './lib.js';

const drafts = new Map();
export function clearReadingDrafts() { drafts.clear(); }
const valuesText = (meter, record) => [1, 2, 3].slice(0, meter.tariffs).map((i) => `${meter.tariffs > 1 ? `Т${i}: ` : ''}${number(record?.[`t${i}`])}`).join(' / ');

function history(meter, initial = []) {
  const details = el('details', { class: 'history-details' });
  details.append(el('summary', {}, 'История'));
  const host = el('div', { class: 'history' }); details.append(host);
  let ready = false;
  details.addEventListener('toggle', async () => {
    if (!details.open || ready) return; ready = true;
    let offset = 0;
    const append = (rows) => {
      for (const r of rows) host.append(el('div', { class: 'history-row' }, [
        el('strong', {}, month(r.period)), el('span', {}, `${valuesText(meter, r)} ${unit(meter.resource)}`),
        el('small', {}, `Расход: ${[1, 2, 3].slice(0, meter.tariffs).map((i) => number(r[`delta_t${i}`])).join(' / ')} ${unit(meter.resource)} · ${date(r.reading_date)}`),
        r.comment ? el('p', {}, r.comment) : null,
      ]));
      offset += rows.length;
    };
    try {
      const rows = initial.length ? initial : await api(`/meters/${meter.id}/readings?limit=200`);
      append(rows);
      if (!rows.length) host.append(el('p', { class: 'muted' }, 'Показаний пока нет.'));
      if (rows.length === 200) {
        const more = button('Ещё показания', async () => {
          more.disabled = true;
          try { const page = await api(`/meters/${meter.id}/readings?limit=200&offset=${offset}`); append(page); if (page.length < 200) more.remove(); }
          catch (e) { host.append(notice(errorMessage(e))); } finally { more.disabled = false; }
        }, 'text-button'); host.append(more);
      }
      const changes = el('details', { class: 'audit-details' }, el('summary', {}, 'Исправления'));
      let loaded = false;
      changes.addEventListener('toggle', async () => {
        if (!changes.open || loaded) return; loaded = true;
        try {
          const rows = await api(`/meters/${meter.id}/history`);
          for (const r of rows) changes.append(el('div', { class: 'history-row' }, [
            el('small', {}, `${dateTime(r.created_at)} · ${r.mine ? 'Вы' : 'Совладелец'}`),
            el('span', {}, `${r.before ? 'Исправлено' : 'Передано'}: ${valuesText(meter, r.after)} ${unit(meter.resource)}`),
            r.before ? el('small', {}, `Было: ${valuesText(meter, r.before)}`) : null,
            r.after.comment ? el('p', {}, r.after.comment) : null,
          ]));
          if (!rows.length) changes.append(el('p', { class: 'muted' }, 'Исправлений через кабинет пока нет.'));
        } catch (e) { loaded = false; changes.append(notice(errorMessage(e))); }
      }); host.append(changes);
    } catch (e) { ready = false; host.replaceChildren(notice(errorMessage(e))); }
  });
  return details;
}

function meterHeading(meter) {
  return el('div', { class: 'meter-heading' }, [meterIcon(meter.resource), el('div', {}, [el('h3', {}, resources[meter.resource] || meter.resource), el('small', { class: 'muted' }, `№ ${meter.serial_number}`)])]);
}

async function propertyReadings(property, allMeters, window) {
  const active = allMeters.filter((m) => m.active);
  const archived = allMeters.filter((m) => !m.active);
  const panel = el('section', { class: 'reading-property' }, [el('h2', {}, `${property.kind_name} № ${property.number}`)]);
  const host = el('div'); panel.append(host);
  let state = drafts.get(property.id);
  if (!state) { state = { values: new Map(), editing: false }; drafts.set(property.id, state); }
  const records = new Map();
  const load = async () => {
    await Promise.all(active.map(async (m) => { records.set(m.id, await api(`/meters/${m.id}/readings?limit=200`)); }));
  };
  function draw(receipt = null) {
    host.replaceChildren();
    if (receipt) host.append(notice(receipt, true));
    const form = el('form', { class: 'property-form' });
    const entries = [];
    const errors = new Map();
    let ownEditable = false;
    let accepted = 0;
    for (const meter of active) {
      const rows = records.get(meter.id) || [];
      const current = window && rows.find((r) => r.period === window.period);
      const previous = previousValues(meter, rows, window?.period || '9999-01-01');
      if (current) accepted++;
      ownEditable ||= !!current?.editable;
      const editable = windowOpen(window) && (!current || (state.editing && current.editable));
      const row = el('div', { class: 'meter-row', 'data-meter-id': meter.id }, meterHeading(meter));
      if (meter.verification_overdue) row.append(el('p', { class: 'inline-warning' }, 'Срок поверки истёк. Обратитесь в ТСЖ.'));
      if (editable) {
        let draft = state.values.get(meter.id);
        if (!draft) { draft = { values: previous.map((_, i) => current?.[`t${i + 1}`] ?? ''), comment: current?.comment || '', commentOpen: !!current?.comment }; state.values.set(meter.id, draft); }
        const inputs = draft.values.map((value, i) => field(meter.tariffs > 1 ? `Т${i + 1}, ${unit(meter.resource)}` : `Новое показание, ${unit(meter.resource)}`, `meter-${meter.id}-t${i + 1}`, {
          value, inputmode: 'decimal', autocomplete: 'off', 'aria-label': `${resources[meter.resource]}, счётчик ${meter.serial_number}, ${meter.tariffs > 1 ? `Т${i + 1}` : 'новое показание'}`,
        }));
        row.append(el('p', { class: 'previous-reading' }, `Предыдущее: ${previous.map(number).join(' / ')} ${unit(meter.resource)}`));
        row.append(el('div', { class: 'tariff-inputs' }, inputs.map((f) => f.node)));
        const preview = el('p', { class: 'consumption', 'aria-live': 'polite' });
        const error = el('div', { role: 'alert' }); errors.set(meter.id, error);
        function update() {
          draft.values = inputs.map(({ control }) => control.value);
          error.replaceChildren(); row.classList.remove('has-error');
          try { preview.textContent = `Расход: ${consumption(draft.values.map(parseReading), previous, meter.coefficient).map(number).join(' / ')} ${unit(meter.resource)}`; }
          catch { preview.textContent = ''; }
        }
        for (const { control } of inputs) control.addEventListener('input', update);
        const comment = field('Комментарий', `comment-${meter.id}`, { type: 'textarea', value: draft.comment, maxlength: 2000, placeholder: 'Например: мы на даче, расхода нет' });
        comment.control.addEventListener('input', () => { draft.comment = comment.control.value; });
        const commentDetails = el('details', { class: 'comment-details', ...(draft.commentOpen ? { open: true } : {}) }, [el('summary', {}, 'Добавить комментарий'), comment.node]);
        commentDetails.addEventListener('toggle', () => { draft.commentOpen = commentDetails.open; });
        row.append(preview, el('div', { class: 'reading-tools' }, [button('Без изменений', () => {
          inputs.forEach(({ control }, i) => { control.value = previous[i]; }); update(); commentDetails.open = true;
        }, 'text-button'), commentDetails]), error);
        entries.push({ meter, draft, previous, revision: current?.revision });
      } else {
        const record = current || rows[0];
        const fallback = Object.fromEntries([1, 2, 3].map((i) => [`t${i}`, meter[`initial_t${i}`]]));
        row.append(el('p', { class: 'reading-value' }, `${valuesText(meter, record || fallback)} ${unit(meter.resource)}`));
        if (current) {
          row.append(el('span', { class: 'accepted' }, `Принято · ${dateTime(current.updated_at)}`));
          if (current.comment) row.append(el('p', { class: 'reading-comment' }, current.comment));
        } else row.append(el('small', { class: 'muted' }, record ? `Последнее показание: ${date(record.reading_date)}` : 'Начальное показание'));
      }
      row.append(history(meter, rows)); form.append(row);
    }
    const status = el('div', { class: 'submission-status', 'aria-live': 'polite' });
    form.append(status);
    if (entries.length) {
      const submit = el('button', { type: 'submit', class: 'button' }, `${state.editing ? 'Сохранить показания' : 'Передать показания'} за ${month(window.period)}`);
      form.append(el('div', { class: 'submit-area' }, [submit, el('small', { class: 'muted' }, 'Пустые поля не отправляются.') ]));
      let busy = false;
      form.addEventListener('submit', async (event) => {
        event.preventDefault(); if (busy) return;
        status.replaceChildren(); for (const error of errors.values()) error.replaceChildren();
        let sending;
        try {
          sending = buildBatch(entries.map(({ meter, draft, previous, revision }) => ({ meter, values: draft.values, comment: draft.comment, previous, revision })), window.period);
          busy = true; for (const input of form.querySelectorAll('input, textarea, button')) input.disabled = true;
          const result = await api(`/properties/${property.id}/readings`, { method: 'POST', body: { readings: sending } });
          for (const r of result.readings) state.values.delete(r.meter_id);
          state.editing = false;
          // Сначала показываем подтверждённый сервером результат: ошибка повторного GET не должна выглядеть как ошибка сохранения.
          for (const r of result.readings) {
            const rows = records.get(r.meter_id) || [];
            records.set(r.meter_id, [{ ...r, editable: false }, ...rows.filter((old) => old.id !== r.id)]);
          }
          const count = result.accepted_count;
          const time = result.readings[0]?.updated_at;
          const receipt = `Принято показаний: ${count} · ${month(window.period)} · ${dateTime(time)}.`;
          draw(receipt);
          try { await load(); draw(receipt); } catch { host.append(button('Обновить данные', async () => { try { await load(); draw(receipt); } catch (e) { status.replaceChildren(notice(errorMessage(e))); } }, 'text-button')); }
        } catch (e) {
          const target = errors.get(e.meterId);
          if (target) { target.replaceChildren(notice(errorMessage(e))); target.closest('.meter-row').classList.add('has-error'); target.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
          else status.replaceChildren(notice(errorMessage(e)));
          busy = false; for (const input of form.querySelectorAll('input, textarea, button')) input.disabled = false;
        }
      });
    }
    if (accepted && ownEditable && windowOpen(window) && !state.editing) form.append(button('Исправить переданные показания', () => { state.editing = true; draw(); }, 'text-button edit-readings'));
    if (accepted === active.length && active.length) form.prepend(el('p', { class: 'accepted property-accepted' }, `Показания за ${month(window.period)} переданы.`));
    host.append(form);
    if (archived.length) {
      const archive = el('details', { class: 'archive-details' }, el('summary', {}, 'Архивные счётчики'));
      for (const meter of archived) archive.append(el('div', { class: 'meter-row' }, [meterHeading(meter), el('small', { class: 'muted' }, meter.removed_at ? `Выведен из работы ${date(meter.removed_at)}` : 'Ещё не введён в эксплуатацию'), history(meter)]));
      host.append(archive);
    }
  }
  try { await load(); draw(); }
  catch (e) { host.replaceChildren(notice(errorMessage(e)), button('Повторить загрузку', async () => { try { await load(); draw(); } catch (e) { host.prepend(notice(errorMessage(e))); } }, 'text-button')); }
  return panel;
}

export async function renderReadings(container, properties, meters, windows, selected) {
  const available = properties.filter((p) => propertyMeters(p, meters).length && (!selected || String(p.id) === selected));
  container.append(el('h1', {}, 'Показания'));
  if (selected) container.append(link('Все объекты', 'meters', { class: 'back-link' }));
  if (!available.length) { container.append(el('p', { class: 'empty-state' }, 'Индивидуальных счётчиков нет.'), link('Моя недвижимость', 'properties')); return; }
  const buildings = [...new Set(available.map((p) => p.building_id))];
  for (const building of buildings) {
    const items = available.filter((p) => p.building_id === building);
    const w = windows.find((x) => x.building_id === building);
    const group = el('section', { class: 'building-readings' });
    if (buildings.length > 1) group.append(el('h2', { class: 'building-title' }, items[0].address));
    else group.append(el('p', { class: 'address-line' }, items[0].address));
    group.append(el('p', { class: `window-message ${windowOpen(w) ? 'window-open' : ''}` }, windowMessage(w)));
    container.append(group);
    const panels = await Promise.all(items.map((p) => propertyReadings(p, propertyMeters(p, meters), w)));
    group.append(...panels);
  }
}
