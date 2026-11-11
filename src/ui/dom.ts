/**
 * Tiny DOM and SVG builders. The game ships under a strict CSP, so markup is never parsed from
 * strings: everything is created element by element and dynamic values go through properties.
 */

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Readonly<Record<string, string | number>>,
  cls?: string,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) setAttrs(el, attrs);
  if (cls) el.setAttribute('class', cls);
  return el;
}

export function setAttrs(el: Element, attrs: Readonly<Record<string, string | number>>): void {
  for (const key of Object.keys(attrs)) el.setAttribute(key, String(attrs[key]));
}

/** A plain text button. `type=button` so it never submits anything. */
export function button(cls: string, label: string, onClick?: (ev: MouseEvent) => void): HTMLButtonElement {
  const b = h('button', cls, label);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/** Small capitals label: the interface's quiet voice for names of things. */
export function label(text: string, cls = ''): HTMLSpanElement {
  return h('span', cls ? `k-label ${cls}` : 'k-label', text);
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function append(parent: Element, ...children: (Node | null | undefined | false)[]): void {
  for (const c of children) if (c) parent.appendChild(c);
}

export function toggleClass(el: Element, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

/** Set text only when it changed: per-frame HUD updates should not churn the DOM. */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/** Focusable children in document order (for moving focus into a new card). */
export function focusables(root: Element): HTMLElement[] {
  const list = root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return Array.from(list).filter((el) => !el.closest('[hidden]'));
}

/** A small inline icon built from SVG paths, sized by CSS. */
export function icon(paths: readonly string[], cls = 'k-icon', viewBox = '0 0 24 24'): SVGSVGElement {
  const svg = s('svg', { viewBox, 'aria-hidden': 'true', focusable: 'false' }, cls);
  for (const d of paths) svg.appendChild(s('path', { d }));
  return svg;
}

export const ICONS = {
  undo: ['M9 7 4 12l5 5', 'M4.5 12H14a5 5 0 0 1 0 10h-2'],
  redo: ['M15 7l5 5-5 5', 'M19.5 12H10a5 5 0 0 0 0 10h2'],
  pause: ['M9 6v12', 'M15 6v12'],
  play: ['M8 5.5v13L18.5 12z'],
  // Two level bars, so the menu never reads as the time HUD's pause.
  menu: ['M5 9.5h14', 'M5 14.5h14'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  reset: ['M5 12a7 7 0 1 0 2.05-4.95', 'M5 4v4h4'],
} as const;
