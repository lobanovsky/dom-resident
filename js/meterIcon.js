import { resources } from './lib.js';
// Те же контуры, что в административном интерфейсе.
const DROP = 'M12 2.6C10.2 5 5.6 10.2 5.6 14.4a6.4 6.4 0 0 0 12.8 0C18.4 10.2 13.8 5 12 2.6z';
const BOLT = 'M13.4 2.2 5 13.4h5.6l-1 8.4 8.4-11.4h-5.6l1-8.2z';
export function meterIcon(resource) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '20'); svg.setAttribute('height', '20');
  svg.setAttribute('class', `meter-icon meter-icon--${resource}`); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', resource === 'electricity' ? BOLT : DROP); path.setAttribute('fill', 'currentColor'); svg.append(path);
  return svg;
}
