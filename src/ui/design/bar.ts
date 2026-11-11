/**
 * The design HUD around the picture: the place heading, the şakül with its number and word, the
 * capacities line after a release, the stone count with its par, undo/redo/reset and the
 * technique chips. Type sits straight on the picture; nothing is boxed but the chips.
 */
import type { DesignModel, ToggleKey } from '../../core/contracts';
import type { LevelDef } from '../../core/types';
import { lt } from '../../core/i18n';
import { formatNumber } from '../../core/format';
import { t, type UiKey } from '../../i18n';
import type { UiContext } from '../context';
import { button, clear, h, icon, ICONS, label, setText, toggleClass } from '../dom';
import { createPlumbGauge } from '../plumb';
import { capacityItems, formatYear } from '../units';

const TOGGLES: readonly ToggleKey[] = ['cutwaters', 'reliefs', 'clamps', 'piles', 'linked'];

export interface DesignBar {
  readonly el: HTMLElement;
  set(model: DesignModel | null): void;
  frame(dt: number): void;
  render(): void;
  control(id: string): HTMLElement | null;
}

export function createDesignBar(ctx: UiContext): DesignBar {
  const el = h('div', 'k-design');

  const heading = h('div', 'k-heading');
  const headYear = h('span', 'k-heading__year k-num');
  const headRiver = label('', 'k-heading__river');
  heading.append(headYear, headRiver);

  const gauge = createPlumbGauge('large');
  gauge.el.classList.add('k-design__gauge');

  const caps = h('div', 'k-caps');
  caps.setAttribute('aria-live', 'polite');

  const stones = h('div', 'k-stones');
  const stonesLabel = label('', 'k-stones__label');
  const stonesNum = h('span', 'k-stones__num k-num');
  const stonesPar = h('span', 'k-stones__par');
  stones.append(stonesLabel, stonesNum, stonesPar);

  const history = h('div', 'k-history');
  const undo = button('k-iconbtn', '', () => ctx.emit({ type: 'undo' }));
  undo.append(icon(ICONS.undo));
  const redo = button('k-iconbtn', '', () => ctx.emit({ type: 'redo' }));
  redo.append(icon(ICONS.redo));
  const reset = button('k-iconbtn', '', () => ctx.emit({ type: 'reset' }));
  reset.append(icon(ICONS.reset));
  history.append(undo, redo, reset);

  const left = h('div', 'k-design__left');
  left.append(stones, history);

  const chips = h('div', 'k-chips');
  chips.setAttribute('role', 'group');
  const chipEls = new Map<ToggleKey, HTMLButtonElement>();
  for (const key of TOGGLES) {
    const chip = button('k-chip', '', () => {
      const on = chip.getAttribute('aria-pressed') === 'true';
      ctx.emit({ type: 'toggle', key, value: !on });
    });
    chip.dataset.toggle = key;
    chip.hidden = true;
    chipEls.set(key, chip);
    chips.appendChild(chip);
  }

  const issue = h('div', 'k-issue');
  issue.setAttribute('role', 'status');

  el.append(heading, gauge.el, caps, left, chips, issue);

  let model: DesignModel | null = null;

  function renderHeading(level: LevelDef | null): void {
    setText(headYear, level ? formatYear(level.year) : '');
    setText(headRiver, level ? lt(level.river) : '');
  }

  function renderCaps(): void {
    clear(caps);
    const level = ctx.level();
    if (!model?.capacities) {
      caps.classList.remove('is-on');
      return;
    }
    const items = capacityItems(
      model.capacities,
      level,
      model.floodMarks.map((f) => f.stage),
      model.piers.length > 0,
      ctx.settings.units,
    );
    items.forEach((item, i) => {
      if (i > 0) caps.appendChild(h('span', 'k-caps__sep', '·'));
      const part = h('span', item.short ? 'k-caps__item is-short' : 'k-caps__item');
      part.append(label(item.label, 'k-caps__label'), h('span', 'k-caps__value', item.value));
      caps.appendChild(part);
    });
    caps.classList.add('is-on');
  }

  function render(): void {
    renderHeading(ctx.level());
    setText(stonesLabel, t('design.stones'));
    undo.setAttribute('aria-label', t('design.undo'));
    undo.title = `${t('design.undo')} (Z)`;
    redo.setAttribute('aria-label', t('design.redo'));
    redo.title = `${t('design.redo')} (Y)`;
    reset.setAttribute('aria-label', t('design.reset'));
    reset.title = t('design.reset');
    chips.setAttribute('aria-label', t('design.techniques'));
    for (const [key, chip] of chipEls) setText(chip, t(`tool.${key}` as UiKey));
    gauge.render();
    update();
    renderCaps();
  }

  function update(): void {
    if (!model) return;
    const m = model;
    gauge.set(m.safety);
    setText(stonesNum, formatNumber(m.stones, 0));
    setText(stonesPar, `/ ${formatNumber(m.parStones, 0)}`);
    stonesPar.title = t('design.par', { n: formatNumber(m.parStones, 0) });
    toggleClass(stones, 'is-over', m.stones > m.parStones);
    undo.disabled = !m.canUndo;
    redo.disabled = !m.canRedo;
    for (const [key, chip] of chipEls) {
      const available = key === 'linked' ? m.spans.length > 1 : m.tools.includes(key);
      chip.hidden = !available;
      chip.setAttribute('aria-pressed', String(m.toggles[key]));
    }
    const first = m.issues[0];
    const text = !m.canBuild && first ? t(`issue.${first.code}` as UiKey) : '';
    setText(issue, text);
    toggleClass(issue, 'is-on', text !== '');
  }

  return {
    el,
    set(next) {
      const prevCaps = model?.capacities ?? null;
      model = next;
      toggleClass(el, 'is-on', next !== null);
      if (!next) {
        gauge.set(null);
        // Forget the old figures, so a later design without capacities does not show stale ones.
        renderCaps();
        return;
      }
      renderHeading(ctx.level());
      update();
      if (next.capacities !== prevCaps) renderCaps();
    },
    frame(dt) {
      gauge.frame(dt, ctx.reducedMotion());
    },
    render,
    control(id) {
      if (id === 'undo') return undo;
      if (id.startsWith('toggle-')) return chipEls.get(id.slice(7) as ToggleKey) ?? null;
      return null;
    },
  };
}
