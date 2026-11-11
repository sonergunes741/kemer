/**
 * Sample data for the ui harness: a believable level, arch geometry built from a few numbers,
 * design models in every mood of the safety gauge, ledger entries and run summaries.
 */
import type { DesignModel, HandleModel, LedgerEntry, SpanModel } from '../src/core/contracts';
import type { BridgeDesign, BridgeGeometry, Hinge, LevelDef, LevelId, LevelRecord, SpanGeometry, Vec2 } from '../src/core/types';

export interface ArchSpec {
  left: number;
  right: number;
  spring: number;
  rise: number;
  thickness: number;
  /** Factor of safety the drawn thrust line should suggest. */
  gsf: number;
}

export interface Arch {
  intrados: Vec2[];
  extrados: Vec2[];
  joints: [Vec2, Vec2][];
  thrust: Vec2[];
  hinges: Hinge[];
  crown: Vec2;
  centre: Vec2;
  radius: number;
  halfAngle: number;
}

const VOUSSOIRS = 16;

/** A circular segment arch with radial joints and a plausible line of thrust for the given safety. */
export function arch(spec: ArchSpec): Arch {
  const L = spec.right - spec.left;
  const f = Math.min(spec.rise, L / 2);
  const R = (L * L) / 4 / (2 * f) + f / 2;
  const cx = (spec.left + spec.right) / 2;
  const cy = spec.spring + f - R;
  const half = Math.asin(Math.min(1, L / 2 / R));
  const at = (phi: number, r: number): Vec2 => ({ x: cx + r * Math.sin(phi), y: cy + r * Math.cos(phi) });
  const dense = 48;
  const intrados: Vec2[] = [];
  const extrados: Vec2[] = [];
  for (let i = 0; i <= dense; i++) {
    const phi = -half + (2 * half * i) / dense;
    intrados.push(at(phi, R));
    extrados.push(at(phi, R + spec.thickness));
  }
  const joints: [Vec2, Vec2][] = [];
  const thrust: Vec2[] = [];
  const hinges: Hinge[] = [];
  const A = 1 / spec.gsf;
  for (let i = 0; i <= VOUSSOIRS; i++) {
    const phi = -half + (2 * half * i) / VOUSSOIRS;
    const a = at(phi, R);
    const b = at(phi, R + spec.thickness);
    joints.push([a, b]);
    const u = Math.abs(phi / half);
    const across = 0.5 + 0.5 * A * Math.cos(1.8 * Math.PI * u);
    thrust.push({ x: a.x + (b.x - a.x) * across, y: a.y + (b.y - a.y) * across });
  }
  // Hinges where the line touches: springings and crown on the extrados, haunches on the intrados.
  for (const [joint, side] of [
    [0, 'extrados'],
    [4, 'intrados'],
    [8, 'extrados'],
    [12, 'intrados'],
    [16, 'extrados'],
  ] as const) {
    hinges.push({ joint, side, at: thrust[joint]! });
  }
  return { intrados, extrados, joints, thrust, hinges, crown: at(0, R), centre: { x: cx, y: cy }, radius: R, halfAngle: half };
}

export interface BridgeSpec {
  spring: number;
  cover: number;
  spans: { left: number; right: number; rise: number; thickness: number }[];
  pierWidth: number;
  gsf: number;
}

export const SINGLE: BridgeSpec = { spring: 0.8, cover: 0.6, spans: [{ left: -7, right: 7, rise: 5, thickness: 0.62 }], pierWidth: 0, gsf: 1.8 };

export const MULTI: BridgeSpec = {
  spring: 1,
  cover: 0.7,
  pierWidth: 2.4,
  gsf: 1.6,
  spans: [
    { left: -20, right: -8, rise: 5.2, thickness: 0.8 },
    { left: -5.6, right: 5.6, rise: 5.6, thickness: 0.8 },
    { left: 8, right: 20, rise: 5.2, thickness: 0.8 },
  ],
};

export function groundFor(spec: BridgeSpec): Vec2[] {
  const left = spec.spans[0]!.left;
  const right = spec.spans[spec.spans.length - 1]!.right;
  const road = roadLevel(spec);
  const s = spec.spring;
  return [
    { x: left - 40, y: road + 0.6 },
    { x: left - 12, y: road + 0.2 },
    { x: left - 5, y: road - 1.2 },
    { x: left - 1.2, y: s + 1.6 },
    { x: left, y: s },
    { x: left + 1.6, y: -0.7 },
    { x: left + 3.5, y: -1.5 },
    { x: right - 3.5, y: -1.5 },
    { x: right - 1.6, y: -0.7 },
    { x: right, y: s },
    { x: right + 1.2, y: s + 1.6 },
    { x: right + 5, y: road - 1.2 },
    { x: right + 12, y: road + 0.2 },
    { x: right + 40, y: road + 0.6 },
  ];
}

export function roadLevel(spec: BridgeSpec): number {
  return spec.spring + Math.max(...spec.spans.map((s) => s.rise + s.thickness)) + spec.cover;
}

export function arches(spec: BridgeSpec): Arch[] {
  return spec.spans.map((s) => arch({ ...s, spring: spec.spring, gsf: spec.gsf }));
}

export function deckFor(spec: BridgeSpec): Vec2[] {
  const left = spec.spans[0]!.left;
  const right = spec.spans[spec.spans.length - 1]!.right;
  const road = roadLevel(spec);
  return [
    { x: left - 3, y: road - 0.25 },
    { x: (left + right) / 2, y: road },
    { x: right + 3, y: road - 0.25 },
  ];
}

export function piersFor(spec: BridgeSpec): { x: number; width: number; base: number; top: number }[] {
  const out: { x: number; width: number; base: number; top: number }[] = [];
  for (let i = 0; i + 1 < spec.spans.length; i++) {
    const x = (spec.spans[i]!.right + spec.spans[i + 1]!.left) / 2;
    out.push({ x, width: spec.pierWidth, base: -3.2, top: spec.spring });
  }
  return out;
}

export function levelFor(spec: BridgeSpec, id: LevelId = 'zamanti'): LevelDef {
  const left = spec.spans[0]!.left;
  const right = spec.spans[spec.spans.length - 1]!.right;
  const road = roadLevel(spec);
  const starter: BridgeDesign = {
    v: 1,
    springLevel: spec.spring,
    piers: piersFor(spec).map((p) => ({ x: p.x, width: p.width })),
    spans: spec.spans.map((s) => ({ rise: s.rise, fullness: 1, thickness: s.thickness })),
    linked: false,
    cover: spec.cover,
    foundation: 2,
    cutwaters: false,
    reliefs: false,
    clamps: false,
    piles: false,
  };
  return {
    id,
    index: 2,
    year: 1176,
    endYear: 2026,
    passYears: 40,
    river: { tr: 'Zamantı Irmağı', en: 'Zamantı River' },
    place: { tr: 'Kayseri', en: 'Kayseri' },
    builder: { tr: 'Usta Yakup', en: 'Master Yakup' },
    site: {
      ground: groundFor(spec),
      soils: [],
      left,
      right,
      springLevel: spec.spring,
      springRange: [spec.spring - 0.5, spec.spring + 1.5],
      roadLeft: road - 0.3,
      roadRight: road - 0.3,
      maxGrade: 0.12,
      width: 4.2,
      pierZone: [left + 4, right - 4],
      slope: 0.003,
      manningN: 0.035,
      flood: { stage2: 1.2, stage100: 3.1, peakDay: 110 },
      seed: 7,
    },
    env: { biome: 'steppe-river', water: 'red', latitude: 38.7, winter: 0.5, frost: 0.5, wet: 0.3, seed: 7 },
    stone: 'andesite',
    tools: spec.spans.length > 1 ? ['rise', 'thickness', 'fullness', 'piers', 'pier-width', 'cutwaters', 'foundation'] : ['rise', 'thickness', 'fullness'],
    limits: { minPiers: 0, maxPiers: 4, thickness: [0.3, 1.6], pierWidth: [1.2, 4], cover: [0.3, 2], foundation: [1, 5], minSpan: 4 },
    hazards: [
      { kind: 'flood', year: 1683, stage: 3.4, debris: 0.4, name: { tr: 'bahar seli', en: 'spring flood' } },
      { kind: 'quake', year: 1784, pga: 0.18 },
    ],
    traffic: [{ from: 1176, to: 1900, actors: ['villager', 'donkey', 'ox-cart'], axle: 60 }],
    parStones: 420,
    starter,
  };
}

export type Mood = 'safe' | 'near' | 'unsafe' | 'heavy';
export const MOOD_GSF: Record<Mood, number> = { safe: 1.8, near: 1.1, unsafe: 0.8, heavy: 3.4 };

export function designModel(spec: BridgeSpec, opts: { capacities?: boolean; canUndo?: boolean; tools?: LevelDef['tools'] } = {}): DesignModel {
  const all = arches(spec);
  const spans: SpanModel[] = all.map((a) => ({
    intrados: a.intrados,
    extrados: a.extrados,
    thrustLine: a.thrust,
    hinges: a.hinges,
    gsf: spec.gsf,
    joints: a.joints,
  }));
  const handles: HandleModel[] = [];
  const piers = piersFor(spec);
  const tools = opts.tools ?? (spec.spans.length > 1 ? ['rise', 'thickness', 'fullness', 'piers', 'pier-width', 'cutwaters', 'reliefs', 'clamps', 'piles'] : ['rise', 'thickness', 'fullness']);
  all.forEach((a, i) => {
    const s = spec.spans[i]!;
    handles.push({ id: { kind: 'crown', index: i }, at: a.crown, axis: { x: 0, y: 1 }, value: s.rise, atMin: false, atMax: s.rise >= (s.right - s.left) / 2 });
    handles.push({ id: { kind: 'ring', index: i }, at: { x: a.crown.x, y: a.crown.y + s.thickness }, axis: { x: 0, y: 1 }, value: s.thickness, atMin: s.thickness <= 0.3, atMax: false });
    const phi = -a.halfAngle * 0.5;
    const nx = Math.sin(phi);
    const ny = Math.cos(phi);
    handles.push({ id: { kind: 'haunch', index: i }, at: { x: a.centre.x + a.radius * nx, y: a.centre.y + a.radius * ny }, axis: { x: nx, y: ny }, value: 0.9, atMin: false, atMax: true });
  });
  piers.forEach((p, i) => {
    handles.push({ id: { kind: 'pier', index: i }, at: { x: p.x, y: -0.4 }, axis: { x: 1, y: 0 }, value: p.x, atMin: false, atMax: false });
    handles.push({ id: { kind: 'pier-side', index: i }, at: { x: p.x + p.width / 2, y: spec.spring - 0.9 }, axis: { x: 1, y: 0 }, value: p.width, atMin: false, atMax: false });
  });
  const stones = Math.round(260 + spec.spans.reduce((n, s) => n + s.thickness * (s.right - s.left) * 22, 0));
  return {
    spans,
    handles,
    deck: deckFor(spec),
    piers,
    safety: spec.gsf,
    stones,
    parStones: 420,
    issues: spec.gsf < 0.5 ? [{ code: 'rise-too-low', index: 0 }] : [],
    tools,
    toggles: { cutwaters: true, reliefs: false, clamps: false, piles: false, linked: true },
    floodMarks: [
      { stage: 1.9, label: { tr: '25 yıllık sel', en: '25-year flood' } },
      { stage: 3.4, label: { tr: '1683', en: '1683' } },
    ],
    capacities: opts.capacities ? { axle: 138, quake: 0.21, floodFree: 4.6, waterway: 0.74, scour: 0.4, spread: 0.06 } : null,
    canUndo: opts.canUndo ?? true,
    canRedo: false,
    canBuild: spec.gsf >= 0.5,
    piersLeft: spec.spans.length > 1 ? 1 : 0,
  };
}

/** Finished geometry for the ledger's line drawings. */
export function geometryFor(spec: BridgeSpec): BridgeGeometry {
  const all = arches(spec);
  const spans: SpanGeometry[] = all.map((a, i) => ({
    index: i,
    left: a.intrados[0]!,
    right: a.intrados[a.intrados.length - 1]!,
    crown: a.crown,
    span: spec.spans[i]!.right - spec.spans[i]!.left,
    joints: a.joints.map(([p, q]) => ({ a: p, b: q })),
    voussoirs: [],
    intrados: a.intrados,
    extrados: a.extrados,
  }));
  const left = spec.spans[0]!;
  const right = spec.spans[spec.spans.length - 1]!;
  return {
    width: 4,
    spans,
    piers: piersFor(spec).map((p, i) => ({ index: i, x: p.x, width: p.width, bed: -1.5, base: p.base, top: p.top, cutwater: true, soil: 'gravel' })),
    abutments: [
      { side: 'left', spring: { x: left.left, y: spec.spring }, soil: 'rock' },
      { side: 'right', spring: { x: right.right, y: spec.spring }, soil: 'rock' },
    ],
    deck: deckFor(spec),
    parapetHeight: 0.6,
    reliefs: [],
    stones: { ring: 200, spandrels: 120, piers: 40, parapets: 30, extras: 0, total: 390 },
  };
}

const RIVERS: [LevelId, number, string, string, string][] = [
  ['koramaz', 1147, 'Koramaz Deresi', 'Ağırnas', 'Usta Hasan'],
  ['zamanti', 1176, 'Zamantı Irmağı', 'Kayseri', 'Usta Yakup'],
  ['kizilirmak', 1202, 'Kızılırmak', 'Kayseri', 'Usta Ali'],
  ['yesilirmak', 1250, 'Yeşilırmak', 'Tokat', 'Usta Musa'],
  ['dicle', 1271, 'Dicle', 'Diyarbakır', 'Usta İbrahim'],
  ['batman', 1284, 'Batman Çayı', 'Silvan', 'Usta Davud'],
  ['aras', 1297, 'Aras', 'Köprüköy', 'Usta Halil'],
  ['arpacay', 1325, 'Arpaçay', 'Ani', 'Usta Ömer'],
  ['firtina', 1354, 'Fırtına Deresi', 'Çamlıhemşin', 'Usta Mehmed'],
  ['sakarya', 1391, 'Sakarya', 'Geyve', 'Usta Yusuf'],
  ['tunca', 1420, 'Tunca', 'Edirne', 'Usta İlyas'],
  ['ergene', 1427, 'Ergene', 'Uzunköprü', 'Usta Süleyman'],
];

export function ledgerEntries(progress: number): LedgerEntry[] {
  return RIVERS.map(([id, year, river, place, builder], i) => {
    const spec = i % 3 === 2 ? MULTI : SINGLE;
    const base = levelFor(spec, id);
    const level: LevelDef = { ...base, index: i + 1, year, river: { tr: river, en: river }, place: { tr: place, en: place }, builder: { tr: builder, en: builder.replace('Usta', 'Master') } };
    const built = i < progress;
    const record: LevelRecord | null = built
      ? {
          bestYears: 2026 - year - (i === 1 ? 312 : 0),
          bestStones: 380 + i * 12,
          seals: { standing: i !== 1, lean: i % 2 === 0, unrepaired: i !== 3 },
          masterwork: i === 0 || i === 2,
          passed: true,
          attempts: 1 + (i % 3),
          design: null,
          markStone: null,
          witnessed: i === 1 ? [1683, 1784] : [1683],
        }
      : null;
    return { level, record, unlocked: i <= progress, sketch: built ? geometryFor(spec) : null };
  });
}
