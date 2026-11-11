/** Shared pieces of the full screens and cards. */
import type { UiScreen } from '../../core/contracts';
import type { FamilyMark } from '../../core/types';
import { t } from '../../i18n';
import type { UiContext } from '../context';
import { button, h, icon, ICONS, s } from '../dom';
import { markPath, normalizeMark } from '../marks';

export interface ScreenView {
  readonly el: HTMLElement;
  frame?(dt: number): void;
  dispose?(): void;
  /** The same screen sent again with new values (sameScreen kept the view). */
  update?(screen: UiScreen): void;
}

/** A full screen laid over the picture with a soft veil. */
export function screenShell(cls: string, labelText?: string): HTMLElement {
  const el = h('section', `k-screen ${cls}`);
  if (labelText) el.setAttribute('aria-label', labelText);
  return el;
}

/** A small card in the middle (settings, keys, pause, credits): the only boxed things. */
export function cardShell(cls: string, heading: string, ctx: UiContext, closable = true): { el: HTMLElement; card: HTMLElement; body: HTMLElement } {
  const el = h('section', `k-screen k-cardscreen ${cls}`);
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', heading);
  const card = h('div', 'k-card');
  const head = h('header', 'k-card__head');
  head.appendChild(h('h2', 'k-card__title k-label', heading));
  if (closable) head.appendChild(closeButton(ctx));
  const body = h('div', 'k-card__body');
  card.append(head, body);
  el.appendChild(card);
  // A click on the veil outside the card closes it, like Escape.
  el.addEventListener('pointerdown', (ev) => {
    if (ev.target === el && closable) ctx.emit({ type: 'close' });
  });
  return { el, card, body };
}

export function closeButton(ctx: UiContext): HTMLButtonElement {
  const b = button('k-iconbtn k-close', '', () => ctx.emit({ type: 'close' }));
  b.setAttribute('aria-label', t('ui.close'));
  b.title = `${t('ui.close')} (Esc)`;
  b.appendChild(icon(ICONS.close));
  return b;
}

/** A quiet text action; `strong` gives it the hairline pill of a main choice. */
export function action(text: string, onClick: () => void, strong = false): HTMLButtonElement {
  return button(strong ? 'k-action k-action--strong' : 'k-action', text, onClick);
}

/** The family mark as a small SVG, chiselled lines on the 3 x 3 grid. */
export function markGlyph(mark: FamilyMark | null, size: number, cls = 'k-markglyph'): SVGSVGElement {
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, 'aria-hidden': 'true' }, cls);
  const pad = size * 0.18;
  if (mark && normalizeMark(mark).strokes.length > 0) {
    svg.appendChild(s('path', { d: markPath(mark, size, pad) }, 'k-markglyph__strokes'));
  }
  return svg;
}

/** Split a template like "{n} yıl" around its number, so the number can be set large. */
export function splitAround(template: string): [string, string] {
  const i = template.indexOf('\u0001');
  return i < 0 ? [template, ''] : [template.slice(0, i), template.slice(i + 1)];
}
