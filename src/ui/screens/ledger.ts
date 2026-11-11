/**
 * The ledger (Defter): the level select and the family's record. A header with the mark, the
 * rank and the years all bridges have stood; one row per river with its year, river and builder,
 * a line drawing of the best bridge there, years stood, seals and the hazards witnessed.
 */
import type { LedgerEntry, UiScreen } from '../../core/contracts';
import { lt } from '../../core/i18n';
import { formatNumber } from '../../core/format';
import { t } from '../../i18n';
import type { UiContext } from '../context';
import { button, h, label, s } from '../dom';
import { drawSketch, shapeFromGeometry } from '../sketch';
import { formatYear, formatYears } from '../units';
import { closeButton, markGlyph, screenShell, splitAround, type ScreenView } from './common';

type LedgerScreen = Extract<UiScreen, { id: 'ledger' }>;

const SKETCH_W = 150;
const SKETCH_H = 40;

function sealDots(seals: { standing: boolean; lean: boolean; unrepaired: boolean } | null, master: boolean): HTMLElement {
  const wrap = h('span', master ? 'k-sealdots is-master' : 'k-sealdots');
  const names = ['standing', 'lean', 'unrepaired'] as const;
  const labels: string[] = [];
  for (const n of names) {
    const on = !!seals?.[n];
    wrap.appendChild(h('span', on ? 'k-sealdot is-on' : 'k-sealdot'));
    if (on) labels.push(t(`seal.${n}`));
  }
  if (master) labels.push(t('seal.masterwork'));
  wrap.setAttribute('aria-label', labels.join(', '));
  wrap.setAttribute('role', 'img');
  return wrap;
}

function sketch(entry: LedgerEntry): Element {
  if (!entry.sketch) return h('span', 'k-ledger__nosketch', entry.unlocked ? t('ledger.notBuilt') : t('ledger.locked'));
  const svg = s('svg', { viewBox: `0 0 ${SKETCH_W} ${SKETCH_H}`, width: SKETCH_W, height: SKETCH_H, 'aria-hidden': 'true' }, 'k-sketch k-ledger__sketch');
  const g = s('g');
  svg.appendChild(g);
  drawSketch(g, shapeFromGeometry(entry.sketch), SKETCH_W, SKETCH_H, 3);
  return svg;
}

function row(entry: LedgerEntry, ctx: UiContext): HTMLElement {
  const { level, record } = entry;
  const master = !!record?.masterwork;
  const li = h('li', `k-ledger__row${entry.unlocked ? '' : ' is-locked'}${master ? ' is-master' : ''}`);
  const main = entry.unlocked
    ? button('k-ledger__main', '', () => ctx.emit({ type: 'level', id: level.id }))
    : h('div', 'k-ledger__main');
  if (entry.unlocked) main.setAttribute('aria-label', t('ledger.open', { river: lt(level.river) }));

  const year = h('span', 'k-ledger__year k-num', formatYear(level.year));
  const names = h('span', 'k-ledger__names');
  names.append(h('span', 'k-ledger__river', lt(level.river)), h('span', 'k-ledger__place', `${lt(level.place)} · ${lt(level.builder)}`));
  if (record && record.witnessed.length > 0) {
    const w = h('span', 'k-ledger__witnessed');
    w.append(label(t('ledger.witnessed')), document.createTextNode(` ${record.witnessed.map(formatYear).join(' · ')}`));
    names.appendChild(w);
  }
  const stood = h('span', 'k-ledger__stood');
  if (record && record.attempts > 0) {
    const [pre, post] = splitAround(t('unit.years', { n: '\u0001' }));
    if (pre.trim()) stood.appendChild(h('span', 'k-ledger__unit', pre.trim()));
    stood.appendChild(h('span', 'k-num', formatNumber(record.bestYears, 0)));
    if (post.trim()) stood.appendChild(h('span', 'k-ledger__unit', post.trim()));
    stood.setAttribute('aria-label', formatYears(record.bestYears));
  }
  main.append(year, names, sketch(entry), stood, sealDots(record?.seals ?? null, master));
  li.appendChild(main);
  return li;
}

export function renderLedger(screen: LedgerScreen, ctx: UiContext): ScreenView {
  const el = screenShell('k-ledger', t('ledger.heading'));
  const head = h('header', 'k-ledger__head');
  const family = h('div', 'k-ledger__family');
  family.append(markGlyph(screen.mark, 44, 'k-markglyph k-ledger__mark'));
  const who = h('div', 'k-ledger__who');
  const total = screen.entries.reduce((sum, e) => sum + (e.record?.bestYears ?? 0), 0);
  who.append(h('h2', 'k-ledger__title k-label', t('ledger.heading')), h('div', 'k-ledger__rank', screen.rank), h('div', 'k-ledger__total', t('ledger.total', { years: formatNumber(total, 0) })));
  family.appendChild(who);
  head.append(family, closeButton(ctx));

  const list = h('ol', 'k-ledger__rows');
  for (const entry of screen.entries) list.appendChild(row(entry, ctx));
  if (screen.epilogue !== 'locked') {
    const li = h('li', `k-ledger__row k-ledger__row--epilogue${screen.epilogue === 'done' ? ' is-done' : ''}`);
    const main = button('k-ledger__main', '', () => ctx.emit({ type: 'level', id: 'epilogue' }));
    const names = h('span', 'k-ledger__names');
    names.append(h('span', 'k-ledger__river', t('ledger.epilogue')), h('span', 'k-ledger__place', t('ledger.epilogueLine')));
    main.append(h('span', 'k-ledger__year k-num', '2026'), names, h('span', 'k-ledger__nosketch', screen.epilogue === 'done' ? t('ledger.epilogueDone') : ''), h('span', 'k-ledger__stood'), h('span', 'k-sealdots'));
    li.appendChild(main);
    list.appendChild(li);
  }
  const scroller = h('div', 'k-ledger__scroll');
  scroller.appendChild(list);
  el.append(head, scroller);
  return { el };
}
