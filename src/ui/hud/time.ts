/**
 * The time HUD: the large turning year in the corner with its season mark, the small şakül, the
 * caption line, a thin timeline from the build year to 2026 with its ticks, and the only controls
 * of the centuries: 1x 2x 4x, pause and Onar with its cost.
 */
import type { TimeHud } from '../../core/contracts';
import type { LevelDef } from '../../core/types';
import { lt } from '../../core/i18n';
import { t, type UiKey } from '../../i18n';
import type { UiContext } from '../context';
import { button, clear, h, icon, ICONS, label, s, setText, toggleClass } from '../dom';
import { createPlumbGauge } from '../plumb';
import { addTick, centuryTicks, displayYear, outlastYear, seasonIndex, yearFraction } from '../timeline';
import { formatStones, formatYear, SAFETY_NARROW } from '../units';

export interface TimeHudView {
  readonly el: HTMLElement;
  set(hud: TimeHud | null): void;
  frame(dt: number): void;
  render(): void;
  control(id: string): HTMLElement | null;
  /** Year last shown, for the collapse screen's "stood N years". */
  readonly lastYear: number | null;
}

export function createTimeHud(ctx: UiContext): TimeHudView {
  const el = h('div', 'k-time');

  // Corner: year, season, river.
  const corner = h('div', 'k-time__corner');
  const yearRow = h('div', 'k-time__yearrow');
  const year = h('div', 'k-year k-num');
  const season = s('svg', { viewBox: '-8 -8 16 16', width: 16, height: 16 }, 'k-season');
  season.append(s('circle', { r: 6 }, 'k-season__ring'));
  const seasonDot = s('circle', { r: 1.9 }, 'k-season__dot');
  season.appendChild(seasonDot);
  yearRow.append(year, season);
  const river = label('', 'k-time__river');
  corner.append(yearRow, river);

  const gauge = createPlumbGauge('small');
  gauge.el.classList.add('k-time__gauge');

  // Bottom: caption, timeline, controls.
  const bottom = h('div', 'k-time__bottom');
  const caption = h('div', 'k-time__caption');
  caption.setAttribute('aria-live', 'polite');
  const line = h('div', 'k-timeline');
  line.setAttribute('role', 'progressbar');
  const startLabel = h('span', 'k-timeline__end k-timeline__end--start k-num');
  const endLabel = h('span', 'k-timeline__end k-timeline__end--end k-num');
  const track = h('div', 'k-timeline__track');
  const fill = h('div', 'k-timeline__fill');
  const ticks = h('div', 'k-timeline__ticks');
  const head = h('div', 'k-timeline__head');
  track.append(fill, ticks, head);
  line.append(startLabel, track, endLabel);

  const controls = h('div', 'k-time__controls');
  const speeds = h('div', 'k-seg');
  speeds.setAttribute('role', 'group');
  const speedBtns = ([1, 2, 4] as const).map((v) => {
    const b = button('k-seg__btn k-num', `${v}×`, () => ctx.emit({ type: 'speed', value: v }));
    speeds.appendChild(b);
    return { v, b };
  });
  const pause = button('k-iconbtn k-time__pause', '', () => ctx.emit({ type: 'pause', on: !(hud?.paused ?? false) }));
  const pauseIcon = icon(ICONS.pause);
  const playIcon = icon(ICONS.play, 'k-icon k-icon--fill');
  pause.append(pauseIcon, playIcon);
  const repair = button('k-repair', '', () => {
    if (hud?.repair.possible) ctx.emit({ type: 'repair' });
  });
  const repairLabel = h('span', 'k-repair__label');
  const repairCost = h('span', 'k-repair__cost');
  repair.append(repairLabel, repairCost);
  controls.append(speeds, pause, repair);
  bottom.append(caption, line, controls);

  el.append(corner, gauge.el, bottom);

  let hud: TimeHud | null = null;
  let level: LevelDef | null = null;
  let eventTicks: number[] = [];
  let lastCaption: string | null = null;
  let ticksKey = '';
  let lastYear: number | null = null;

  function drawTicks(): void {
    if (!hud) return;
    const key = `${hud.builtYear}|${hud.endYear}|${eventTicks.join(',')}|${level?.passYears ?? 0}`;
    if (key === ticksKey) return;
    ticksKey = key;
    clear(ticks);
    const add = (y: number, cls: string, title?: string): void => {
      const tick = h('span', `k-tick ${cls}`);
      tick.style.left = `${(yearFraction(y, hud!.builtYear, hud!.endYear) * 100).toFixed(3)}%`;
      if (title) tick.title = title;
      ticks.appendChild(tick);
    };
    for (const y of centuryTicks(hud.builtYear, hud.endYear)) add(y, 'k-tick--century');
    const outlast = level ? outlastYear(hud.builtYear, level.passYears, hud.endYear) : null;
    if (outlast !== null) add(outlast, 'k-tick--outlast', t('time.outlast'));
    for (const y of eventTicks) add(y, 'k-tick--event', formatYear(y));
  }

  function render(): void {
    speeds.setAttribute('aria-label', t('time.speed'));
    setText(repairLabel, t('time.repair'));
    line.setAttribute('aria-label', t('time.timeline'));
    gauge.render();
    ticksKey = '';
    update();
  }

  function update(): void {
    if (!hud) return;
    const y = displayYear(hud.year, hud.builtYear, hud.endYear);
    lastYear = y;
    setText(year, formatYear(y));
    setText(river, level ? `${lt(level.river)} · ${formatStones(hud.stones)}` : formatStones(hud.stones));
    const angle = hud.season * Math.PI * 2 - Math.PI / 2;
    seasonDot.setAttribute('cx', (Math.cos(angle) * 6).toFixed(2));
    seasonDot.setAttribute('cy', (Math.sin(angle) * 6).toFixed(2));
    season.setAttribute('aria-label', t(`time.season${seasonIndex(hud.season)}` as UiKey));
    gauge.set(hud.safety);

    if (hud.caption && hud.caption !== lastCaption) eventTicks = addTick(eventTicks, hud.year, 2);
    lastCaption = hud.caption;
    setText(caption, hud.caption ?? '');
    toggleClass(caption, 'is-on', !!hud.caption);

    setText(startLabel, formatYear(hud.builtYear));
    setText(endLabel, formatYear(hud.endYear));
    const f = yearFraction(hud.year, hud.builtYear, hud.endYear);
    fill.style.transform = `scaleX(${f.toFixed(4)})`;
    head.style.left = `${(f * 100).toFixed(3)}%`;
    line.setAttribute('aria-valuemin', String(hud.builtYear));
    line.setAttribute('aria-valuemax', String(hud.endYear));
    line.setAttribute('aria-valuenow', String(y));
    drawTicks();

    for (const { v, b } of speedBtns) b.setAttribute('aria-pressed', String(hud.speed === v && !hud.paused));
    pause.setAttribute('aria-label', hud.paused ? t('time.play') : t('time.pause'));
    pause.title = `${hud.paused ? t('time.play') : t('time.pause')} (P)`;
    toggleClass(pause, 'is-paused', hud.paused);
    const possible = hud.repair.possible;
    repair.disabled = !possible;
    setText(repairCost, possible ? formatStones(hud.repair.stones) : '');
    repair.setAttribute('aria-label', possible ? `${t('time.repair')}, ${formatStones(hud.repair.stones)}` : t('time.repairNone'));
    toggleClass(repair, 'is-lit', possible && hud.safety < SAFETY_NARROW);
  }

  return {
    el,
    set(next) {
      const newRun = !hud || !next || next.builtYear !== hud.builtYear || next.year < hud.year - 1;
      hud = next;
      level = ctx.level();
      toggleClass(el, 'is-on', next !== null);
      if (!next) {
        gauge.set(null);
        return;
      }
      if (newRun) {
        // A new run (or a rewind): forget the ticks of the last one.
        eventTicks = (level?.hazards ?? []).filter((hz) => hz.year <= next.year).map((hz) => hz.year);
        lastCaption = null;
        ticksKey = '';
      }
      update();
    },
    frame(dt) {
      gauge.frame(dt, ctx.reducedMotion());
    },
    render,
    control(id) {
      if (id === 'repair') return repair;
      if (id === 'speed') return speeds;
      return null;
    },
    get lastYear() {
      return lastYear;
    },
  };
}
