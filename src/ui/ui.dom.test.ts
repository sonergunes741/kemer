// @vitest-environment happy-dom
/**
 * Smoke test of the whole interface in a DOM: every screen and overlay renders without throwing,
 * the visible controls emit the intents the game expects, and the HUD follows its models.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Projector, UiApi, UiIntent, UiScreen } from '../core/contracts';
import { defaultSettings } from '../core/config';
import type { Vec2 } from '../core/types';
import { designModel, ledgerEntries, levelFor, MULTI, SINGLE } from '../../harness/ui-samples';
import { createUi } from './index';
import { PRESET_MARKS } from './marks';

const projector: Projector = {
  toScreen: (p: Vec2, out?: Vec2) => {
    const o = out ?? { x: 0, y: 0 };
    o.x = 640 + p.x * 30;
    o.y = 400 - p.y * 30;
    return o;
  },
  fromScreen: (x: number, y: number) => ({ x: (x - 640) / 30, y: (400 - y) / 30 }),
};

const level = levelFor(SINGLE);

let host: HTMLElement;
let ui: UiApi;
let intents: UiIntent[];

function click(el: Element | null | undefined): void {
  expect(el, 'control exists').toBeTruthy();
  (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  ui = createUi(host, projector, { lang: 'tr', settings: defaultSettings('tr') });
  intents = [];
  ui.onIntent((i) => intents.push(i));
});

afterEach(() => {
  ui.dispose();
  host.remove();
});

describe('ui in a DOM', () => {
  it('renders every screen and overlay without throwing', () => {
    const summary = { level: level.id, builtYear: 1176, lastYear: 2026, years: 850, passed: true, seals: { standing: true, lean: true, unrepaired: true }, masterwork: true, stones: 398, repairs: 0 };
    const screens: UiScreen[] = [
      { id: 'none' },
      { id: 'title', firstRun: true, canContinue: false, postgame: false },
      { id: 'title', firstRun: false, canContinue: true, postgame: true },
      { id: 'mark', current: null },
      { id: 'vignette', year: 1176, heading: 'Usta', lines: ['Bir', 'İki'] },
      { id: 'survey', level },
      { id: 'design', level },
      { id: 'build', level, step: 'stones' },
      { id: 'build', level, step: 'keystone' },
      { id: 'time', level },
      { id: 'result', level, summary, record: { bestYears: 850, bestStones: 398, seals: { ...summary.seals }, masterwork: true, passed: true, attempts: 1, design: null, markStone: null, witnessed: [] }, newSeals: ['standing', 'lean'], hasNext: true, lines: ['Satır'] },
      { id: 'collapse', level, epitaph: '1683 selinde yıkıldı.', why: 'İnce.', hint: 'Kalın tut.' },
      { id: 'ledger', entries: ledgerEntries(5), rank: 'Kalfa', mark: PRESET_MARKS[0]!, epilogue: 'locked' },
    ];
    for (const s of screens) {
      expect(() => ui.setScreen(s)).not.toThrow();
      expect(() => ui.frame(1 / 60)).not.toThrow();
    }
    for (const o of [{ id: 'settings', settings: defaultSettings('tr') }, { id: 'keys' }, { id: 'pause' }, { id: 'credits' }] as UiScreen[]) {
      expect(() => ui.setOverlay(o)).not.toThrow();
      ui.frame(1 / 60);
    }
    ui.setOverlay(null);
    expect(() => ui.setLang('en')).not.toThrow();
  });

  it('starts the game from the first title', () => {
    ui.setScreen({ id: 'title', firstRun: true, canContinue: false, postgame: false });
    click(buttonByText('Başla'));
    expect(intents).toContainEqual({ type: 'begin' });
  });

  it('runs the design screen: model, primary, undo and toggles', () => {
    ui.setScreen({ id: 'design', level: levelFor(MULTI) });
    ui.setDesign(designModel(MULTI, { capacities: true, canUndo: true }));
    ui.frame(1 / 60);
    // One slider per handle, reachable by keyboard.
    const sliders = host.querySelectorAll('[role="slider"]');
    expect(sliders.length).toBeGreaterThan(3);
    // The thrust line is drawn.
    expect(host.querySelector('.k-thrust path[d^="M"]')).toBeTruthy();

    const undo = host.querySelector<HTMLButtonElement>('[aria-label="Geri al"]');
    click(undo);
    expect(intents).toContainEqual({ type: 'undo' });

    const chip = host.querySelector<HTMLButtonElement>('.k-chip:not([hidden])');
    click(chip);
    expect(intents.some((i) => i.type === 'toggle')).toBe(true);

    // The capacities line appears after a release and goes when the model goes.
    expect(host.querySelector('.k-caps.is-on')).toBeTruthy();
    ui.setDesign(null);
    expect(host.querySelector('.k-caps.is-on')).toBeNull();
  });

  it('nudges a focused handle with the arrow keys', () => {
    ui.setScreen({ id: 'design', level });
    ui.setDesign(designModel(SINGLE));
    ui.frame(1 / 60);
    const handle = host.querySelector<SVGGElement>('[role="slider"]');
    handle!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
    const nudge = intents.find((i) => i.type === 'nudge');
    expect(nudge).toBeTruthy();
    expect(nudge && nudge.type === 'nudge' && Math.abs(nudge.steps)).toBe(5);
  });

  it('runs the time HUD controls', () => {
    ui.setScreen({ id: 'time', level });
    ui.setTime({ year: 1683.2, endYear: 2026, builtYear: 1176, safety: 1.1, speed: 1, paused: false, repair: { possible: true, stones: 24 }, stones: 398, caption: '1683 · bahar seli', season: 0.3 });
    ui.frame(1 / 60);
    expect(host.querySelector('.k-year')?.textContent).toContain('1683');
    click(buttonByText('2×') ?? host.querySelectorAll('.k-time__controls .k-seg__btn')[1]);
    expect(intents).toContainEqual({ type: 'speed', value: 2 });
    click(host.querySelector('.k-repair'));
    expect(intents).toContainEqual({ type: 'repair' });
  });

  it('asks twice before erasing the save', () => {
    ui.setOverlay({ id: 'settings', settings: defaultSettings('tr') });
    const erase = host.querySelector<HTMLButtonElement>('.k-erase');
    click(erase);
    expect(intents.some((i) => i.type === 'erase-save')).toBe(false);
    click(erase);
    expect(intents).toContainEqual({ type: 'erase-save' });
  });

  it('closes an open card with Escape', () => {
    ui.setScreen({ id: 'design', level });
    ui.setOverlay({ id: 'keys' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(intents).toContainEqual({ type: 'close' });
  });

  it('lets only a skip through while hidden', () => {
    ui.setScreen({ id: 'design', level });
    ui.setDesign(designModel(SINGLE));
    ui.setVisible(false);
    click(host.querySelector('[aria-label="Geri al"]'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(intents).toEqual([{ type: 'skip' }]);
  });
});
