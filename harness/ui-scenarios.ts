/** Every screen and state the interface can be in, as named scenarios for the harness and its screenshots. */
import type { BuildHud, CoachStep, TimeHud, UiApi, UiScreen } from '../src/core/contracts';
import type { LevelDef, RunSummary, Settings } from '../src/core/types';
import { PRESET_MARKS } from '../src/ui/marks';
import { ledgerEntries, MULTI, SINGLE, type BridgeSpec } from './ui-samples';

export interface MockTime {
  year: number;
  speed: 1 | 2 | 4;
  paused: boolean;
  safety: number;
  caption: string | null;
  running: boolean;
  repairStones: number;
}

export interface Harness {
  readonly ui: UiApi;
  readonly settings: Settings;
  spec: BridgeSpec;
  level: LevelDef;
  capacities: boolean;
  time: MockTime;
  build: { laid: number; total: number; holding: boolean; step: Extract<UiScreen, { id: 'build' }>['step'] };
  setScene(look: 'draft' | 'stone' | 'none', spec: BridgeSpec, evening?: number): void;
  sendDesign(): void;
  sendTime(): void;
  sendBuild(): void;
  timeHud(): TimeHud;
}

type Run = (hx: Harness) => void;

/** Coach texts are written "tr|en" here; the game hands the UI one already localised. */
function localCoach(hx: Harness, step: CoachStep): CoachStep {
  const [tr, en] = step.text.split('|');
  return { ...step, text: (hx.settings.lang === 'tr' ? tr : en) ?? step.text };
}

const withGsf = (spec: BridgeSpec, gsf: number): BridgeSpec => ({ ...spec, gsf, spans: spec.spans.map((s) => ({ ...s })) });

function design(spec: BridgeSpec, gsf: number, caps = false, coach: CoachStep | null = null): Run {
  return (hx) => {
    hx.setScene('draft', spec);
    hx.spec = withGsf(spec, gsf);
    hx.capacities = caps;
    hx.ui.setScreen({ id: 'design', level: hx.level });
    hx.sendDesign();
    if (coach) hx.ui.coach(localCoach(hx, coach));
  };
}

function build(step: Extract<UiScreen, { id: 'build' }>['step'], laid: number, coach: CoachStep | null = null): Run {
  return (hx) => {
    hx.setScene(step === 'centering' ? 'draft' : 'stone', SINGLE);
    hx.build = { laid, total: 412, holding: false, step };
    hx.ui.setScreen({ id: 'build', level: hx.level, step });
    hx.sendBuild();
    if (coach) hx.ui.coach(localCoach(hx, coach));
  };
}

function time(patch: Partial<MockTime>, coach: CoachStep | null = null, caption: [string, string | null] | null = null): Run {
  return (hx) => {
    hx.setScene('stone', SINGLE, 0.15);
    hx.time = { year: 1176, speed: 1, paused: false, safety: 1.8, caption: null, running: false, repairStones: 24, ...patch };
    hx.ui.setScreen({ id: 'time', level: hx.level });
    hx.sendTime();
    if (coach) hx.ui.coach(localCoach(hx, coach));
    if (caption) hx.ui.caption(caption[0], caption[1]);
  };
}

function summary(hx: Harness, master: boolean): RunSummary {
  return {
    level: hx.level.id,
    builtYear: hx.level.year,
    lastYear: 2026,
    years: 2026 - hx.level.year,
    passed: true,
    seals: { standing: true, lean: master, unrepaired: true },
    masterwork: master,
    stones: 398,
    repairs: master ? 0 : 1,
  };
}

const overlayOnDesign = (screen: (hx: Harness) => UiScreen): Run => (hx) => {
  design(SINGLE, 1.8)(hx);
  hx.ui.setOverlay(screen(hx));
};

export const SCENARIOS: Record<string, Record<string, Run>> = {
  title: {
    first: (hx) => {
      hx.setScene('stone', SINGLE, 0.7);
      hx.ui.setScreen({ id: 'title', firstRun: true, canContinue: false, postgame: false });
    },
    later: (hx) => {
      hx.setScene('stone', SINGLE, 0.7);
      hx.ui.setScreen({ id: 'title', firstRun: false, canContinue: true, postgame: false });
    },
    postgame: (hx) => {
      hx.setScene('stone', MULTI, 0.7);
      hx.ui.setScreen({ id: 'title', firstRun: false, canContinue: false, postgame: true });
    },
  },
  mark: {
    empty: (hx) => {
      hx.setScene('stone', SINGLE);
      hx.ui.setScreen({ id: 'mark', current: null });
    },
    chosen: (hx) => {
      hx.setScene('stone', SINGLE);
      hx.ui.setScreen({ id: 'mark', current: PRESET_MARKS[2]! });
    },
  },
  vignette: {
    default: (hx) => {
      hx.setScene('none', SINGLE, 0.8);
      hx.ui.setScreen({
        id: 'vignette',
        year: 1176,
        heading: hx.settings.lang === 'tr' ? 'Usta Yakup, Hasan’ın torunu' : 'Master Yakup, grandson of Hasan',
        lines:
          hx.settings.lang === 'tr'
            ? ['Zamantı her bahar kervan yolunu keser.', 'Bey bir köprü istedi. Taşı Erciyes’ten, kireci köyden.', 'Dedem derdi ki: kemer yükünü taşa, taş da toprağa verir.']
            : ['Every spring the Zamantı cuts the caravan road.', 'The bey wants a bridge. Stone from Erciyes, lime from the village.', 'My grandfather said: the arch gives its load to the stone, the stone to the earth.'],
      });
    },
  },
  survey: {
    default: (hx) => {
      hx.setScene('none', SINGLE, 0.2);
      hx.ui.setScreen({ id: 'survey', level: hx.level });
    },
  },
  design: {
    safe: design(SINGLE, 1.8),
    near: design(SINGLE, 1.1),
    unsafe: design(SINGLE, 0.8),
    heavy: design(SINGLE, 3.4),
    released: design(SINGLE, 1.8, true),
    piers: design(MULTI, 1.6, true),
    coach: design(SINGLE, 0.8, false, { text: 'Kemerin sırtını yukarı çek: yük çizgisi taşın içine girsin.|Pull the back of the ring up until the line sits inside the stone.', target: { kind: 'handle', id: { kind: 'ring', index: 0 } }, gesture: 'drag-up' }),
    blocked: design(SINGLE, 0.4),
  },
  build: {
    centering: build('centering', 0),
    stones: build('stones', 148),
    keystone: build('keystone', 411),
    mark: build('mark', 412),
    wedges: build('wedges', 412),
    coach: build('stones', 12, { text: 'Basılı tut: taşlar iki yandan kilide doğru dizilir.|Hold: the stones are laid from both sides towards the crown.', target: { kind: 'control', id: 'primary' }, gesture: 'hold' }),
  },
  time: {
    calm: time({ year: 1388.4, safety: 1.9 }),
    running: time({ year: 1176, running: true }),
    event: time({ year: 1683.2, safety: 1.35, caption: '1683 · bahar seli', speed: 1 }),
    danger: time({ year: 1784.6, safety: 1.08, speed: 2 }),
    falling: time({ year: 1859.1, safety: 0.86, speed: 1, caption: '1859 · deprem' }),
    paused: time({ year: 1512, paused: true, safety: 1.6 }),
    coach: time({ year: 1176, paused: true }, { text: 'Güneşi tut ve gökyüzünde sürükle.|Take hold of the sun and draw it across the sky.', target: { kind: 'elevation', at: { x: -9, y: 9.5 } }, gesture: 'drag-arc' }),
    caption: time({ year: 2026, safety: 1.7 }, null, ['2026', null]),
  },
  result: {
    master: (hx) => {
      hx.setScene('stone', SINGLE, 0.6);
      const s = summary(hx, true);
      hx.ui.setScreen({ id: 'result', level: hx.level, summary: s, record: { bestYears: s.years, bestStones: s.stones, seals: { ...s.seals }, masterwork: true, passed: true, attempts: 2, design: null, markStone: null, witnessed: [1683] }, newSeals: ['standing', 'lean', 'unrepaired', 'masterwork'], hasNext: true, lines: hx.settings.lang === 'tr' ? ['Köprü sekiz yüz elli yıl Zamantı’nın bahar sularını geçirdi.', 'Torunun torunu üstünden yürüyerek okula gitti.'] : ['For eight hundred and fifty years the bridge let the Zamantı’s spring waters through.', 'His grandson’s grandson walked over it to school.'] });
    },
    partial: (hx) => {
      hx.setScene('stone', SINGLE, 0.6);
      const s = summary(hx, false);
      hx.ui.setScreen({ id: 'result', level: hx.level, summary: s, record: { bestYears: s.years, bestStones: s.stones, seals: { ...s.seals }, masterwork: false, passed: true, attempts: 1, design: null, markStone: null, witnessed: [] }, newSeals: ['standing'], hasNext: false, lines: hx.settings.lang === 'tr' ? ['Emniyet 1,04’e düştü, dayandı.'] : ['Safety fell to 1.04. It held.'] });
    },
  },
  collapse: {
    default: (hx) => {
      design(SINGLE, 0.8)(hx);
      hx.ui.setDesign(null);
      hx.setScene('none', SINGLE, 0.8);
      hx.time.year = 1683;
      hx.ui.setScreen({ id: 'time', level: hx.level });
      hx.sendTime();
      hx.ui.setScreen({
        id: 'collapse',
        level: hx.level,
        epitaph: hx.settings.lang === 'tr' ? '1683 bahar selinde yıkıldı.' : 'It fell in the spring flood of 1683.',
        why: hx.settings.lang === 'tr' ? 'Kemer ince kaldı: yük çizgisi taşın dışına çıktı ve dört mafsal açıldı.' : 'The ring was too thin: the line of thrust left the stone and four hinges opened.',
        hint: hx.settings.lang === 'tr' ? '“Kemerin sırtını kalın tut; taş, yükün yolunu içinde bulmalı.”' : '“Keep the ring deep; the stone must find the path of the load within itself.”',
      });
    },
  },
  ledger: {
    early: (hx) => {
      hx.setScene('stone', SINGLE, 0.6);
      hx.ui.setScreen({ id: 'ledger', entries: ledgerEntries(3), rank: hx.settings.lang === 'tr' ? 'Kalfa' : 'Journeyman', mark: PRESET_MARKS[2]!, epilogue: 'locked' });
    },
    late: (hx) => {
      hx.setScene('stone', SINGLE, 0.6);
      hx.ui.setScreen({ id: 'ledger', entries: ledgerEntries(12), rank: hx.settings.lang === 'tr' ? 'Başusta' : 'Head mason', mark: PRESET_MARKS[9]!, epilogue: 'open' });
    },
  },
  settings: { default: overlayOnDesign((hx) => ({ id: 'settings', settings: { ...hx.settings } })) },
  keys: { default: overlayOnDesign(() => ({ id: 'keys' })) },
  pause: { default: overlayOnDesign(() => ({ id: 'pause' })) },
  credits: {
    default: (hx) => {
      hx.setScene('stone', SINGLE, 0.7);
      hx.ui.setScreen({ id: 'title', firstRun: false, canContinue: true, postgame: false });
      hx.ui.setOverlay({ id: 'credits' });
    },
  },
  toast: {
    default: (hx) => {
      design(SINGLE, 1.8, true)(hx);
      hx.ui.toast(hx.settings.lang === 'tr' ? 'Kemer yükünü taşıyor.' : 'The arch carries its load.', 'good');
      hx.ui.toast(hx.settings.lang === 'tr' ? 'Yük çizgisi taşın dışında.' : 'The line of thrust leaves the stone.', 'warn');
    },
  },
};

export function buildHudFor(hx: Harness): BuildHud {
  const tr = hx.settings.lang === 'tr';
  return { laid: hx.build.laid, total: hx.build.total, action: hx.build.step === 'stones' ? (tr ? 'Taşları diz' : 'Lay the stones') : '', hold: hx.build.step === 'stones' };
}
