import { el } from './dom.js';

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

function formatMonth(value) {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`));
}

export function renderDebts(main, summary) {
  main.append(el('h1', {}, 'Задолженность'));
  if (!summary.period) {
    main.append(el('section', { class: 'debt-report-empty', role: 'status' }, [
      el('h2', {}, 'Пока нет данных о задолженности'),
      el('p', {}, 'Сведения появятся после загрузки очередного отчёта в систему ТСН.'),
    ]));
    return;
  }

  const total = Number(summary.total || 0);
  main.append(el('section', { class: `debt-summary${total > 0 ? ' has-debt' : ''}`, 'aria-label': `Задолженность по данным за ${formatMonth(summary.period)}` }, [
    el('p', { class: 'debt-period' }, `По данным на ${formatMonth(summary.period)}`),
    el('p', { class: 'debt-total' }, formatMoney(total)),
    el('p', { class: 'debt-caption' }, total > 0 ? 'Общая сумма по всем вашим объектам' : 'По последнему отчёту задолженности нет.'),
  ]));

  if (summary.items?.length) {
    main.append(el('h2', { class: 'debt-list-title' }, 'По объектам'));
    main.append(el('div', { class: 'debt-list' }, summary.items.map((item) => el('article', { class: 'debt-item' }, [
      el('div', {}, [
        el('strong', {}, `${item.premises_kind} № ${item.premises_number} · ${item.purpose === 'capital_repair' ? 'Капремонт' : 'ЖКУ'}`),
        el('p', { class: 'debt-address' }, item.address),
        el('span', { class: 'debt-account' }, `Лицевой счёт ${item.account_number}`),
      ]),
      el('strong', { class: 'debt-item-amount' }, formatMoney(item.debt)),
    ]))));
  }
  main.append(el('p', { class: 'debt-note' }, 'Сумма взята из последнего загруженного отчёта ТСН. Она может измениться после следующего обновления данных.'));
}
