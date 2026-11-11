/**
 * UI harness: the interface alone over a painted stand-in for the scene, with a fake projector,
 * sample models for every screen and state, and a small mock of the game so handles, toggles,
 * time and settings answer. URL: ?screen=design&state=unsafe&lang=tr&units=metre&hc=0&strip=1
 */
import '../src/styles/base.css';
import './ui.css';
import { loadFonts } from '../src/app/fonts';
import type { Projector, TimeHud, UiIntent } from '../src/core/contracts';
import { defaultSettings } from '../src/core/config';
import type { Settings, Vec2 } from '../src/core/types';
import { createUi } from '../src/ui/index';
import { fitProjector, paintScene } from './ui-scene';
import { buildHudFor, SCENARIOS, type Harness } from './ui-scenarios';
import { PRESET_MARKS } from '../src/ui/marks';
import { designModel, ledgerEntries, levelFor, SINGLE, type BridgeSpec } from './ui-samples';

const params = new URLSearchParams(location.search);
const lang = params.get('lang') === 'en' ? 'en' : 'tr';
const settings: Settings = {
  ...defaultSettings(lang),
  units: params.get('units') === 'arsin' ? 'arsin' : 'metre',
  highContrast: params.get('hc') === '1',
  reducedMotion: params.get('rm') === '1',
  textScale: Number(params.get('text') ?? '1') || 1,
};

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const host = document.getElementById('ui') as HTMLElement;

let fit = fitProjector(SINGLE, innerWidth, innerHeight);
// The interface keeps one projector for life; the harness swaps the fit behind it.
const projector: Projector = {
  toScreen: (p: Vec2, out?: Vec2) => fit.toScreen(p, out),
  fromScreen: (x: number, y: number) => fit.fromScreen(x, y),
};

await loadFonts(2000);
const ui = createUi(host, projector, { lang, settings: { ...settings } });

let scene: { look: 'draft' | 'stone' | 'none'; spec: BridgeSpec; evening: number } = { look: 'draft', spec: SINGLE, evening: 0.2 };
const history: BridgeSpec[] = [];
const future: BridgeSpec[] = [];
const toggles = { cutwaters: true, reliefs: false, clamps: false, piles: false, linked: true };

const hx: Harness = {
  ui,
  settings,
  spec: SINGLE,
  level: levelFor(SINGLE),
  capacities: false,
  time: { year: 1176, speed: 1, paused: false, safety: 1.8, caption: null, running: false, repairStones: 24 },
  build: { laid: 0, total: 412, holding: false, step: 'stones' },
  setScene(look, spec, evening = 0.2) {
    scene = { look, spec, evening };
    hx.level = levelFor(spec);
    repaint();
  },
  sendDesign() {
    const m = designModel(hx.spec, { capacities: hx.capacities });
    ui.setDesign({ ...m, toggles: { ...toggles }, canUndo: history.length > 0, canRedo: future.length > 0 });
  },
  sendTime() {
    ui.setTime(hx.timeHud());
  },
  sendBuild() {
    ui.setBuild(buildHudFor(hx));
  },
  timeHud(): TimeHud {
    const t = hx.time;
    return {
      year: t.year,
      endYear: 2026,
      builtYear: hx.level.year,
      safety: t.safety,
      speed: t.speed,
      paused: t.paused,
      repair: { possible: t.safety < 1.6, stones: t.repairStones },
      stones: 398,
      caption: t.caption,
      season: (t.year % 1 + 1) % 1,
    };
  },
};

function repaint(): void {
  fit = fitProjector(scene.spec, innerWidth, innerHeight);
  paintScene(canvas, fit, { spec: scene.spec, look: scene.look, evening: scene.evening, water: 0 });
}

/** A toy safety law so dragging the ring or the crown moves the şakül the right way. */
function safetyOf(spec: BridgeSpec): number {
  const s = spec.spans[0]!;
  const L = s.right - s.left;
  return Math.max(0.3, (s.thickness / L / 0.022) * (0.6 + (0.4 * s.rise) / (L / 2)));
}

function editSpec(fn: (s: BridgeSpec['spans'][number]) => void): void {
  const next: BridgeSpec = { ...hx.spec, spans: hx.spec.spans.map((s) => ({ ...s })) };
  next.spans.forEach(fn);
  next.gsf = safetyOf(next);
  hx.spec = next;
}

let current: { screen: string; state: string } = { screen: params.get('screen') ?? 'design', state: params.get('state') ?? '' };

function run(screen: string, state: string): void {
  const states = SCENARIOS[screen] ?? SCENARIOS.design!;
  const name = state && states[state] ? state : Object.keys(states)[0]!;
  current = { screen: SCENARIOS[screen] ? screen : 'design', state: name };
  ui.setOverlay(null);
  ui.coach(null);
  ui.caption(null);
  ui.setDesign(null);
  ui.setBuild(null);
  ui.setTime(null);
  history.length = 0;
  future.length = 0;
  states[name]!(hx);
  syncStrip();
  const url = new URL(location.href);
  url.searchParams.set('screen', current.screen);
  url.searchParams.set('state', current.state);
  window.history.replaceState(null, '', url);
}

function onIntent(intent: UiIntent): void {
  out.value = JSON.stringify(intent);
  switch (intent.type) {
    case 'handle': {
      if (intent.phase === 'grab') history.push(hx.spec);
      const { kind } = intent.id;
      editSpec((s) => {
        const L = s.right - s.left;
        if (kind === 'crown') s.rise = Math.max(1, Math.min(L / 2, intent.to.y - hx.spec.spring));
        if (kind === 'ring') s.thickness = Math.max(0.3, Math.min(1.6, intent.to.y - hx.spec.spring - s.rise));
      });
      hx.capacities = intent.phase === 'release';
      future.length = 0;
      hx.sendDesign();
      break;
    }
    case 'nudge':
      history.push(hx.spec);
      editSpec((s) => {
        if (intent.id.kind === 'crown') s.rise = Math.max(1, Math.min((s.right - s.left) / 2, s.rise + intent.steps * 0.1));
        if (intent.id.kind === 'ring') s.thickness = Math.max(0.3, Math.min(1.6, s.thickness + intent.steps * 0.05));
      });
      hx.capacities = true;
      hx.sendDesign();
      break;
    case 'undo':
      if (history.length > 0) {
        future.push(hx.spec);
        hx.spec = history.pop()!;
        hx.sendDesign();
      }
      break;
    case 'redo':
      if (future.length > 0) {
        history.push(hx.spec);
        hx.spec = future.pop()!;
        hx.sendDesign();
      }
      break;
    case 'toggle':
      toggles[intent.key] = intent.value;
      hx.sendDesign();
      break;
    case 'primary':
      if (current.screen === 'build') hx.build.holding = intent.phase === 'down';
      else if (intent.phase === 'up') ui.toast(lang === 'tr' ? 'Kur' : 'Build');
      break;
    case 'speed':
      hx.time.speed = intent.value;
      hx.time.paused = false;
      hx.sendTime();
      break;
    case 'pause':
      if (current.screen === 'time' && !intent.on) hx.time.paused = false;
      else if (current.screen === 'time') hx.time.paused = true;
      hx.sendTime();
      ui.setOverlay(intent.on ? { id: 'pause' } : null);
      break;
    case 'repair':
      hx.time.safety = 1.9;
      hx.sendTime();
      ui.toast(lang === 'tr' ? 'Derzler yenilendi.' : 'The joints are repointed.', 'good');
      break;
    case 'settings':
      Object.assign(settings, intent.patch);
      ui.setOverlay({ id: 'settings', settings: { ...settings } });
      break;
    case 'open':
      if (intent.screen === 'title') {
        run('title', 'later');
      } else if (intent.screen === 'daily' || intent.screen === 'millennium') {
        ui.toast(intent.screen);
      } else if (intent.screen === 'ledger') {
        if (current.screen === 'title') run('ledger', 'late');
        else ui.setOverlay({ id: 'ledger', entries: ledgerEntries(5), rank: lang === 'tr' ? 'Kalfa' : 'Journeyman', mark: PRESET_MARKS[2]!, epilogue: 'locked' });
      } else {
        ui.setOverlay(intent.screen === 'settings' ? { id: 'settings', settings: { ...settings } } : { id: intent.screen });
      }
      break;
    case 'close':
      if (current.screen === 'ledger') run('title', 'later');
      else ui.setOverlay(null);
      break;
    default:
      ui.toast(intent.type);
  }
}
ui.onIntent(onIntent);

// Control strip
const strip = document.createElement('div');
strip.className = 'hx-strip';
const screenSel = document.createElement('select');
const stateSel = document.createElement('select');
const prev = document.createElement('button');
prev.textContent = '◀';
const next = document.createElement('button');
next.textContent = '▶';
const out = document.createElement('output');
for (const s of Object.keys(SCENARIOS)) screenSel.add(new Option(s, s));
strip.append(screenSel, stateSel, prev, next, out);
if (params.get('strip') !== '0') document.body.appendChild(strip);

function syncStrip(): void {
  screenSel.value = current.screen;
  stateSel.length = 0;
  for (const s of Object.keys(SCENARIOS[current.screen] ?? {})) stateSel.add(new Option(s, s));
  stateSel.value = current.state;
}
function step(d: number): void {
  const all = Object.entries(SCENARIOS).flatMap(([sc, st]) => Object.keys(st).map((s) => [sc, s] as const));
  const i = all.findIndex(([sc, s]) => sc === current.screen && s === current.state);
  const [sc, s] = all[(i + d + all.length) % all.length]!;
  run(sc, s);
}
screenSel.addEventListener('change', () => run(screenSel.value, ''));
stateSel.addEventListener('change', () => run(current.screen, stateSel.value));
prev.addEventListener('click', () => step(-1));
next.addEventListener('click', () => step(1));

addEventListener('resize', () => {
  repaint();
});

// Frame loop with a little mock time.
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (current.screen === 'time' && hx.time.running && !hx.time.paused) {
    hx.time.year = Math.min(2026, hx.time.year + dt * 14 * hx.time.speed);
    hx.time.safety = 1.9 - Math.max(0, (hx.time.year - 1600) / 400) * 0.9;
    hx.sendTime();
  }
  if (current.screen === 'build' && hx.build.holding && hx.build.laid < hx.build.total) {
    hx.build.laid = Math.min(hx.build.total, hx.build.laid + dt * 30);
    hx.build.laid = Math.round(hx.build.laid * 100) / 100;
    ui.setBuild({ ...buildHudFor(hx), laid: Math.floor(hx.build.laid) });
  }
  ui.frame(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

repaint();
run(current.screen, current.state);

declare global {
  interface Window {
    harness: { run(screen: string, state: string): void; ui: typeof ui };
  }
}
window.harness = { run, ui };
