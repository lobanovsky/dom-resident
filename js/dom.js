export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of [children].flat(Infinity)) if (child != null && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
export const link = (text, route, attrs = {}) => el('a', { href: `#${route}`, ...attrs }, text);
export const button = (text, action, className = 'button') => el('button', { type: 'button', class: className, onclick: action }, text);
export const notice = (text, good = false) => el('p', { class: `notice ${good ? 'success' : ''}`, role: good ? 'status' : 'alert' }, text);
export function field(label, name, { type = 'text', value, ...attrs } = {}) {
  const control = el(type === 'textarea' ? 'textarea' : 'input', { name, ...(type === 'textarea' ? {} : { type }), ...attrs });
  if (value != null) control.value = value;
  return { node: el('label', { class: 'field' }, [el('span', {}, label), control]), control };
}
export function definitions(items) {
  return el('dl', { class: 'definitions' }, items.filter(([, value]) => value != null && value !== '').map(([name, value]) => [el('dt', {}, name), el('dd', {}, value)]));
}
