// Представление заявок и телефонная маска. Авторизацию объектов выполняет сервер.
export function groupGateRequests(rows) {
  const groups = new Map();
  for (const row of rows) {
    const id = row.group_id || row.id;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return [...groups].map(([id, items]) => {
    const root = items.find((r) => r.id === id) || items[0];
    const states = new Set(items.map((r) => r.effective_status));
    const active = items.some((r) => r.active);
    return {
      ...root,
      id,
      items,
      active,
      display_status: active
        ? 'approved'
        : items.every((r) => (r.status || r.effective_status) === 'pending')
          ? 'pending'
          : 'rejected',
      eligible: items.every((r) => r.eligible),
      effective_status: states.size === 1 ? root.effective_status : active ? 'partial' : 'attention',
    };
  });
}

export function formatGatePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (
    String(value || '')
      .trim()
      .startsWith('+7') ||
    (digits.length === 11 && /^[78]/.test(digits))
  )
    digits = digits.slice(1);
  digits = digits.slice(0, 10);
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 8), digits.slice(8, 10)].filter(Boolean);
  return ['+7', ...parts].join(' ');
}
export function bindGatePhone(input) {
  const initial = String(input.value || '').trim();
  const initialDigits = initial.replace(/\D/g, '');
  input.value =
    (initial.startsWith('+') && !initial.startsWith('+7')) ||
    (initialDigits.length > 10 && !/^[78]\d{10}$/.test(initialDigits))
      ? '+7'
      : formatGatePhone(initial);
  const update = () => {
    input.setCustomValidity('');
    const before = input.value;
    const position = input.selectionStart ?? before.length;
    const digitCount = before.slice(0, position).replace(/\D/g, '').length;
    input.value = formatGatePhone(before);
    let cursor = 0,
      count = 0;
    while (cursor < input.value.length && count < digitCount) {
      if (/\d/.test(input.value[cursor])) count++;
      cursor++;
    }
    input.setSelectionRange(Math.max(2, cursor), Math.max(2, cursor));
  };
  input.addEventListener('input', update);
  input.addEventListener('beforeinput', (e) => {
    if (e.inputType.startsWith('insert') && input.selectionStart < 2)
      input.setSelectionRange(2, Math.max(2, input.selectionEnd));
    if (!e.inputType.startsWith('delete') || input.selectionStart !== input.selectionEnd) return;
    const cursor = input.selectionStart;
    if (e.inputType === 'deleteContentBackward' && cursor <= 2) {
      e.preventDefault();
      return;
    }
    if (e.inputType === 'deleteContentForward' && input.value[cursor] === ' ') {
      e.preventDefault();
      input.value = input.value.slice(0, cursor) + input.value.slice(cursor + 2);
      input.setSelectionRange(cursor, cursor);
      update();
      return;
    }
    if (e.inputType === 'deleteContentBackward' && input.value[cursor - 1] === ' ') {
      e.preventDefault();
      input.value = input.value.slice(0, cursor - 2) + input.value.slice(cursor);
      input.setSelectionRange(cursor - 2, cursor - 2);
      update();
    }
  });
  input.addEventListener('paste', (e) => {
    const value = e.clipboardData?.getData('text');
    if (!value) return;
    const digits = value.replace(/\D/g, '');
    if ((value.trim().startsWith('+') && !value.trim().startsWith('+7')) || digits.length > 11) {
      e.preventDefault();
      input.setCustomValidity('Укажите российский номер с кодом +7.');
      input.reportValidity();
      return;
    }
    if (digits.length === 10 || (digits.length === 11 && /^[78]/.test(digits))) {
      e.preventDefault();
      input.value = formatGatePhone(value);
      input.setSelectionRange(input.value.length, input.value.length);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}

export function gateAccessNote(row) {
  return (
    {
      revoked: 'Доступ отозван.',
      cancelled: 'Заявка отменена заявителем.',
      expired: 'Срок доступа истёк.',
      ineligible: 'Право на объект не подтверждено.',
    }[row.effective_status] || ''
  );
}
