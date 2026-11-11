/**
 * Level-like fixtures for the world harness: three sites from the brief (a 7 m stream in tuff,
 * a 27 m river in steppe, a 60 m river in a green valley) plus a gorge, and a plain bridge
 * geometry for each so foam, shadows and reflections can be judged.
 */
import type { BiomeId, BridgeDesign, BridgeGeometry, LevelDef, SiteDef, SpanGeometry, Vec2, WaterTint } from '../src/core/types';

export type SiteKey = 'stream' | 'river' | 'wide' | 'gorge';

const P = (pts: [number, number][]): Vec2[] => pts.map(([x, y]) => ({ x, y }));

interface SiteFixture {
  readonly site: SiteDef;
  /** Spans as [left x, right x, rise]; piers between them get the width below. */
  readonly spans: [number, number, number][];
  readonly pierWidth: number;
  readonly deckCover: number;
}

const flood = (stage2: number, stage100: number) => ({ stage2, stage100, peakDay: 110 });

const SITES: Record<SiteKey, SiteFixture> = {
  // Koramaz at Ağırnas: a 7 m stream at the foot of tuff walls.
  stream: {
    site: {
      ground: P([
        [-34, 9.6], [-25, 9.3], [-18, 8.7], [-15, 6.4], [-12, 3.6], [-9, 2.2], [-6, 1.4], [-4.3, 0.8], [-3.6, 0.25], [-3.1, -0.4],
        [-2, -0.75], [0, -0.85], [2, -0.7], [3.1, -0.4], [3.6, 0.25], [4.4, 0.85], [6.5, 1.5], [9.5, 2.5], [13, 4.2], [17, 7.0],
        [21, 9.1], [27, 9.9], [34, 10.2],
      ]),
      soils: [],
      left: -3.6,
      right: 3.6,
      springLevel: 0.6,
      springRange: [0.2, 1.2],
      roadLeft: 4,
      roadRight: 4,
      maxGrade: 0.12,
      width: 3.2,
      pierZone: [-3, 3],
      slope: 0.01,
      manningN: 0.04,
      flood: flood(0.8, 2.4),
      seed: 1147,
    },
    spans: [[-3.6, 3.6, 2.7]],
    pierWidth: 0,
    deckCover: 0.9,
  },
  // Kızılırmak near Tekgöz: a 27 m river through rolling steppe.
  river: {
    site: {
      ground: P([
        [-80, 10], [-62, 7.6], [-50, 5.3], [-38, 3.6], [-28, 3.0], [-20, 2.4], [-16.5, 1.4], [-14.6, 0.3], [-13.6, -0.4], [-11, -1.3],
        [-6, -2.0], [0, -2.3], [6, -2.1], [11, -1.4], [13.6, -0.4], [14.6, 0.3], [16.5, 1.2], [20, 2.2], [30, 3.0], [42, 4.4],
        [56, 6.8], [80, 10.5],
      ]),
      soils: [],
      left: -13.5,
      right: 13.5,
      springLevel: 0.8,
      springRange: [0.3, 2],
      roadLeft: 6,
      roadRight: 6,
      maxGrade: 0.15,
      width: 4.5,
      pierZone: [-10, 10],
      slope: 0.0015,
      manningN: 0.035,
      flood: flood(1.6, 4.5),
      seed: 1202,
    },
    spans: [[-13.5, 13.5, 13]],
    pierWidth: 0,
    deckCover: 1.2,
  },
  // Yeşilırmak at Tokat: a 60 m river between levees on a wide flood plain.
  wide: {
    site: {
      ground: P([
        [-155, 15], [-132, 9.5], [-112, 5.4], [-90, 3.3], [-60, 2.7], [-42, 2.4], [-35, 1.6], [-32, 0.5], [-30.6, -0.3], [-27, -1.5],
        [-18, -2.5], [0, -2.9], [18, -2.6], [27, -1.6], [30.6, -0.3], [32, 0.4], [35, 1.5], [42, 2.3], [60, 2.6], [90, 3.0],
        [116, 6.2], [136, 11], [155, 16],
      ]),
      soils: [],
      left: -30,
      right: 30,
      springLevel: 1.0,
      springRange: [0.5, 2.5],
      roadLeft: 4,
      roadRight: 4,
      maxGrade: 0.12,
      width: 5,
      pierZone: [-24, 24],
      slope: 0.001,
      manningN: 0.035,
      flood: flood(1.8, 4.2),
      seed: 1250,
    },
    spans: [
      [-30, -12.3, 7],
      [-8.7, 8.7, 8.7],
      [12.3, 30, 7],
    ],
    pierWidth: 3.6,
    deckCover: 1.0,
  },
  // A 38 m gorge for the cliff biomes.
  gorge: {
    site: {
      ground: P([
        [-80, 46], [-60, 44], [-42, 41], [-30, 36], [-24, 22], [-21, 9], [-19.5, 2.2], [-19, 0.3], [-18.2, -0.8], [-12, -2.2],
        [0, -2.8], [12, -2.3], [18.2, -0.8], [19, 0.3], [19.6, 2.5], [21.5, 11], [24.5, 25], [31, 38], [44, 43], [62, 45], [80, 47],
      ]),
      soils: [],
      left: -19,
      right: 19,
      springLevel: 1.5,
      springRange: [0.5, 4],
      roadLeft: 22,
      roadRight: 22,
      maxGrade: 0.2,
      width: 4.2,
      pierZone: [-15, 15],
      slope: 0.004,
      manningN: 0.04,
      flood: flood(2.2, 6),
      seed: 1284,
    },
    spans: [[-19, 19, 17]],
    pierWidth: 0,
    deckCover: 1.2,
  },
};

const BIOME_DEFAULTS: Record<BiomeId, { site: SiteKey; water: WaterTint; latitude: number; winter: number; wet: number; index: number }> = {
  'tuff-valley': { site: 'stream', water: 'clear', latitude: 38.8, winter: 0.55, wet: 0.3, index: 1 },
  'steppe-river': { site: 'river', water: 'red', latitude: 38.9, winter: 0.5, wet: 0.25, index: 3 },
  'green-valley': { site: 'wide', water: 'green', latitude: 40.3, winter: 0.45, wet: 0.55, index: 4 },
  'basalt-plain': { site: 'wide', water: 'brown', latitude: 37.9, winter: 0.25, wet: 0.25, index: 5 },
  'limestone-gorge': { site: 'gorge', water: 'turquoise', latitude: 38.1, winter: 0.35, wet: 0.35, index: 6 },
  highland: { site: 'river', water: 'clear', latitude: 40.1, winter: 0.95, wet: 0.35, index: 7 },
  canyon: { site: 'gorge', water: 'green', latitude: 40.5, winter: 0.8, wet: 0.3, index: 8 },
  'rain-forest': { site: 'river', water: 'milky', latitude: 41.0, winter: 0.4, wet: 0.95, index: 9 },
  'alluvial-plain': { site: 'wide', water: 'green', latitude: 40.5, winter: 0.35, wet: 0.55, index: 10 },
  'flood-plain': { site: 'wide', water: 'green', latitude: 41.7, winter: 0.4, wet: 0.5, index: 11 },
  marsh: { site: 'wide', water: 'brown', latitude: 41.3, winter: 0.35, wet: 0.6, index: 12 },
};

const STARTER: BridgeDesign = {
  v: 1,
  springLevel: 0.6,
  piers: [],
  spans: [{ rise: 2.7, fullness: 1, thickness: 0.5 }],
  linked: true,
  cover: 0.4,
  foundation: 1,
  cutwaters: false,
  reliefs: false,
  clamps: false,
  piles: false,
};

export function fixtureLevel(biome: BiomeId, siteKey?: SiteKey): LevelDef {
  const d = BIOME_DEFAULTS[biome];
  const s = SITES[siteKey ?? d.site].site;
  return {
    id: 'daily',
    index: d.index,
    year: 1147,
    endYear: 2026,
    passYears: 30,
    river: { tr: 'Deneme', en: 'Fixture' },
    place: { tr: 'Deneme', en: 'Fixture' },
    builder: { tr: 'Usta', en: 'Mason' },
    site: s,
    env: { biome, water: d.water, latitude: d.latitude, winter: d.winter, frost: d.winter, wet: d.wet, seed: s.seed + d.index },
    stone: 'tuff',
    tools: ['rise', 'thickness'],
    limits: { minPiers: 0, maxPiers: 4, thickness: [0.3, 1.5], pierWidth: [1, 5], cover: [0.2, 2], foundation: [0.5, 4], minSpan: 3 },
    hazards: [],
    traffic: [],
    parStones: 100,
    starter: STARTER,
  };
}

export function fixtureSite(biome: BiomeId, siteKey?: SiteKey): SiteFixture {
  return SITES[siteKey ?? BIOME_DEFAULTS[biome].site];
}

function arc(left: Vec2, right: Vec2, rise: number, n: number, out: number): Vec2[] {
  // Circular segment up to a semicircle, pointed (two arcs) above that; `out` offsets the curve outward.
  const span = right.x - left.x;
  const mid = (left.x + right.x) / 2;
  const pts: Vec2[] = [];
  if (rise <= span / 2 + 1e-6) {
    const r = (rise * rise + (span / 2) * (span / 2)) / (2 * rise);
    const cy = left.y + rise - r;
    const a0 = Math.atan2(left.y - cy, left.x - mid);
    const a1 = Math.atan2(right.y - cy, right.x - mid);
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push({ x: mid + Math.cos(a) * (r + out), y: cy + Math.sin(a) * (r + out) });
    }
  } else {
    // Pointed: each half is an arc centred on the far side, through the springing and the crown.
    const h = rise;
    const half = span / 2;
    const r = (half * half + h * h) / (2 * half);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const leftHalf = t <= 0.5;
      const cx = leftHalf ? left.x + r : right.x - r;
      const sx = leftHalf ? left.x : right.x;
      const angS = Math.atan2(left.y - left.y, sx - cx);
      const angC = Math.atan2(left.y + h - left.y, mid - cx);
      const k = leftHalf ? t * 2 : (1 - t) * 2;
      const a = angS + (angC - angS) * k;
      pts.push({ x: cx + Math.cos(a) * (r + out), y: left.y + Math.sin(a) * (r + out) });
    }
  }
  return pts;
}

/** A plain bridge for the fixture: spans, piers, deck. Joints and voussoirs are left empty. */
export function fixtureBridge(biome: BiomeId, siteKey?: SiteKey): BridgeGeometry {
  const f = fixtureSite(biome, siteKey);
  const s = f.site;
  const thickness = Math.max(0.45, (f.spans[0]![1] - f.spans[0]![0]) * 0.045);
  const spans: SpanGeometry[] = f.spans.map(([x0, x1, rise], index) => {
    const left = { x: x0, y: s.springLevel };
    const right = { x: x1, y: s.springLevel };
    return {
      index,
      left,
      right,
      crown: { x: (x0 + x1) / 2, y: s.springLevel + rise },
      span: x1 - x0,
      joints: [],
      voussoirs: [],
      intrados: arc(left, right, rise, 40, 0),
      extrados: arc(left, right, rise, 40, thickness),
    };
  });
  const piers = f.spans.slice(1).map((sp, i) => {
    const prev = f.spans[i]!;
    const x = (prev[1] + sp[0]) / 2;
    return { index: i, x, width: f.pierWidth, bed: -2.6, base: -4, top: s.springLevel, cutwater: false, soil: 'gravel' as const };
  });
  const top = Math.max(...spans.map((sp) => sp.crown.y)) + thickness + f.deckCover;
  const x0 = s.left - Math.max(3, (s.right - s.left) * 0.15);
  const x1 = s.right + Math.max(3, (s.right - s.left) * 0.15);
  const deck: Vec2[] = [
    { x: x0, y: top - 0.25 },
    { x: (x0 + x1) / 2, y: top },
    { x: x1, y: top - 0.25 },
  ];
  return {
    width: s.width,
    spans,
    piers,
    abutments: [
      { side: 'left', spring: spans[0]!.left, soil: 'rock' },
      { side: 'right', spring: spans[spans.length - 1]!.right, soil: 'rock' },
    ],
    deck,
    parapetHeight: 0.6,
    reliefs: [],
    stones: { ring: 0, spandrels: 0, piers: 0, parapets: 0, extras: 0, total: 0 },
  };
}
