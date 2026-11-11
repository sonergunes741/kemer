/**
 * Level fixtures for tests, the debug harness and the other teams. They are plausible sites, not
 * the game's authored levels (those live in src/content).
 *
 *   a  a 7 m village stream on rock, in tuff: one span, tools rise + thickness
 *   b  a 27 m gorge on rock: one large span
 *   c  a 60 m river on gravel: two to four piers, floods that matter
 *   d  a 20 m span between clay banks: thrust makes the abutments yield
 */
import type { BridgeDesign, LevelDef, SpanDesign, TrafficEra } from '../../core/types';

const span = (rise: number, fullness: number, thickness: number): SpanDesign => ({ rise, fullness, thickness });

function design(partial: Partial<BridgeDesign> & Pick<BridgeDesign, 'springLevel' | 'spans'>): BridgeDesign {
  return {
    v: 1,
    piers: [],
    linked: true,
    cover: 0.5,
    foundation: 2,
    cutwaters: false,
    reliefs: false,
    clamps: false,
    piles: false,
    ...partial,
  };
}

const oldRoads = (from: number, axle: number): TrafficEra => ({ from, to: 1920, actors: ['villager', 'donkey', 'ox-cart', 'caravan'], axle });
const modernRoads = (axle: number): TrafficEra => ({ from: 1920, to: 2027, actors: ['villager', 'truck', 'cyclist'], axle });

/** (a) Village stream in a tuff valley: 7 m between rock banks. */
export const fixtureA: LevelDef = {
  id: 'koramaz',
  index: 1,
  year: 1100,
  endYear: 2026,
  passYears: 60,
  river: { tr: 'Koramaz Deresi', en: 'Koramaz Stream' },
  place: { tr: 'Ağırnas', en: 'Ağırnas' },
  builder: { tr: 'Taşçı Yusuf', en: 'Yusuf the mason' },
  site: {
    ground: [
      { x: -14, y: 3.4 },
      { x: -5, y: 3.1 },
      { x: -0.4, y: 2.8 },
      { x: 0.7, y: 0.5 },
      { x: 2.2, y: -0.5 },
      { x: 3.5, y: -0.7 },
      { x: 4.8, y: -0.5 },
      { x: 6.3, y: 0.5 },
      { x: 7.4, y: 2.8 },
      { x: 12, y: 3.1 },
      { x: 21, y: 3.4 },
    ],
    soils: [],
    left: 0,
    right: 7,
    springLevel: 1,
    springRange: [0.6, 1.6],
    roadLeft: 3,
    roadRight: 3,
    maxGrade: 0.3,
    width: 3,
    pierZone: [3.5, 3.5],
    slope: 0.012,
    manningN: 0.045,
    flood: { stage2: 0.9, stage100: 2.3, peakDay: 105 },
    seed: 1101,
  },
  env: { biome: 'tuff-valley', water: 'clear', latitude: 38.8, winter: 0.5, frost: 0.45, wet: 0.2, seed: 11 },
  stone: 'tuff',
  tools: ['rise', 'thickness'],
  limits: { minPiers: 0, maxPiers: 0, thickness: [0.25, 0.9], pierWidth: [1, 2], cover: [0.3, 0.8], foundation: [1, 1], minSpan: 3 },
  hazards: [
    { kind: 'flood', year: 1247, stage: 2.2, debris: 0.3, name: { tr: 'Bahar seli', en: 'The spring flood' } },
    // The site's greatest flood comes while a well-built ring left alone can still be standing
    // (tuff here loses about 0.9 mm of joint a year, up to 1.5 mm once plants have grown in): the
    // "unrepaired" seal has to be earnable.
    { kind: 'flood', year: 1389, stage: 2.9, debris: 0.5, name: { tr: 'Büyük sel', en: 'The great flood' } },
    { kind: 'load', year: 1520, axle: 45, actor: 'cannon', name: { tr: 'Ordunun topu', en: "The army's cannon" } },
    { kind: 'quake', year: 1835, pga: 0.18, name: { tr: 'Kayseri depremi', en: 'The Kayseri earthquake' } },
  ],
  traffic: [oldRoads(1100, 12), modernRoads(30)],
  parStones: 330,
  starter: design({ springLevel: 1, spans: [span(2.4, 1, 0.45)], cover: 0.4, foundation: 1 }),
};

/** (b) A single 27 m span across a limestone gorge. */
export const fixtureB: LevelDef = {
  id: 'batman',
  index: 6,
  year: 1147,
  endYear: 2026,
  passYears: 80,
  river: { tr: 'Batman Çayı', en: 'Batman River' },
  place: { tr: 'Silvan', en: 'Silvan' },
  builder: { tr: 'Usta Davud', en: 'Master Davud' },
  site: {
    ground: [
      { x: -50, y: 13 },
      { x: -12, y: 12.5 },
      { x: -1, y: 11 },
      { x: 0.5, y: 3 },
      { x: 4, y: -1.5 },
      { x: 13.5, y: -3 },
      { x: 23, y: -1.5 },
      { x: 26.5, y: 3 },
      { x: 28, y: 11 },
      { x: 39, y: 12.5 },
      { x: 77, y: 13 },
    ],
    soils: [],
    left: 0,
    right: 27,
    springLevel: 2,
    springRange: [1, 5],
    roadLeft: 12,
    roadRight: 12,
    maxGrade: 0.18,
    width: 6,
    pierZone: [13.5, 13.5],
    slope: 0.004,
    manningN: 0.04,
    flood: { stage2: 2.2, stage100: 5.5, peakDay: 95 },
    seed: 1147,
  },
  env: { biome: 'limestone-gorge', water: 'turquoise', latitude: 38.1, winter: 0.35, frost: 0.3, wet: 0.25, seed: 62 },
  stone: 'limestone',
  tools: ['rise', 'thickness', 'fullness', 'spring', 'cover', 'clamps'],
  limits: { minPiers: 0, maxPiers: 0, thickness: [0.5, 1.8], pierWidth: [2, 4], cover: [0.4, 1.5], foundation: [1, 1], minSpan: 10 },
  hazards: [
    { kind: 'flood', year: 1388, stage: 5.2, debris: 0.4, name: { tr: 'Kar suyu seli', en: 'The snowmelt flood' } },
    { kind: 'quake', year: 1514, pga: 0.28, name: { tr: 'Büyük deprem', en: 'The great earthquake' } },
    { kind: 'load', year: 1638, axle: 170, actor: 'cannon', name: { tr: 'Bağdat seferi topları', en: 'The siege guns for Baghdad' } },
    { kind: 'flood', year: 1762, stage: 6.8, debris: 0.6, name: { tr: 'Yüzyılın seli', en: 'The flood of the century' } },
  ],
  traffic: [oldRoads(1147, 30), modernRoads(100)],
  parStones: 3400,
  starter: design({ springLevel: 2, spans: [span(11, 0.85, 1)], cover: 0.6, foundation: 1 }),
};

/** (c) A 60 m steppe river on gravel: piers, scour and floods. */
export const fixtureC: LevelDef = {
  id: 'kizilirmak',
  index: 3,
  year: 1202,
  endYear: 2026,
  passYears: 70,
  river: { tr: 'Kızılırmak', en: 'Kızılırmak' },
  place: { tr: 'Kesikköprü', en: 'Kesikköprü' },
  builder: { tr: 'Usta Hasan', en: 'Master Hasan' },
  site: {
    ground: [
      { x: -95, y: 5.5 },
      { x: -20, y: 4.5 },
      { x: -2, y: 3.8 },
      { x: 3, y: 0.4 },
      { x: 12, y: -1.6 },
      { x: 30, y: -2.4 },
      { x: 48, y: -1.6 },
      { x: 57, y: 0.4 },
      { x: 62, y: 3.8 },
      { x: 80, y: 4.5 },
      { x: 155, y: 5.5 },
    ],
    soils: [{ from: -20, to: 80, soil: 'gravel' }],
    left: 0,
    right: 60,
    springLevel: 1.2,
    springRange: [0.8, 2.5],
    roadLeft: 6,
    roadRight: 6,
    maxGrade: 0.12,
    width: 6.5,
    pierZone: [6, 54],
    slope: 0.0008,
    manningN: 0.035,
    flood: { stage2: 2, stage100: 4.6, peakDay: 110, regulatedFrom: 1960, regulatedFactor: 0.5 },
    seed: 1202,
  },
  env: { biome: 'steppe-river', water: 'red', latitude: 39.4, winter: 0.55, frost: 0.5, wet: 0.2, seed: 33 },
  stone: 'andesite',
  tools: ['rise', 'thickness', 'fullness', 'piers', 'pier-width', 'spring', 'cover', 'cutwaters', 'reliefs', 'clamps', 'piles', 'foundation'],
  limits: { minPiers: 2, maxPiers: 4, thickness: [0.4, 1.5], pierWidth: [2, 5], cover: [0.4, 1.2], foundation: [1.5, 5], minSpan: 6 },
  hazards: [
    { kind: 'flood', year: 1403, stage: 4.4, debris: 0.5, name: { tr: 'Kızıl sel', en: 'The red flood' } },
    { kind: 'load', year: 1640, axle: 120, actor: 'cannon', name: { tr: 'Sefer topu', en: 'The campaign gun' } },
    { kind: 'quake', year: 1668, pga: 0.3, name: { tr: 'Büyük Anadolu depremi', en: 'The great Anatolian earthquake' } },
    { kind: 'flood', year: 1721, stage: 5.9, debris: 0.7, name: { tr: 'Büyük taşkın', en: 'The great flood' } },
    { kind: 'flood', year: 1955, stage: 4.2, debris: 0.3, name: { tr: 'Son büyük taşkın', en: 'The last great flood' } },
  ],
  traffic: [oldRoads(1202, 30), modernRoads(120)],
  parStones: 9000,
  starter: design({
    springLevel: 1.2,
    piers: [
      { x: 15, width: 3.5 },
      { x: 30, width: 3.5 },
      { x: 45, width: 3.5 },
    ],
    spans: [span(4.2, 1, 0.7), span(4.2, 1, 0.7), span(4.2, 1, 0.7), span(4.2, 1, 0.7)],
    cover: 0.5,
    foundation: 2.5,
    cutwaters: true,
  }),
};

/** (d) One 20 m span between clay banks on a flat alluvial plain. */
export const fixtureD: LevelDef = {
  id: 'sakarya',
  index: 10,
  year: 1560,
  endYear: 2026,
  passYears: 60,
  river: { tr: 'Sakarya', en: 'Sakarya' },
  place: { tr: 'Geyve', en: 'Geyve' },
  builder: { tr: 'Kalfa Mehmed', en: 'Foreman Mehmed' },
  site: {
    ground: [
      { x: -40, y: 3.2 },
      { x: -10, y: 2.9 },
      { x: -1, y: 2.6 },
      { x: 2, y: 0.3 },
      { x: 6, y: -1.3 },
      { x: 10, y: -1.6 },
      { x: 14, y: -1.3 },
      { x: 18, y: 0.3 },
      { x: 21, y: 2.6 },
      { x: 30, y: 2.9 },
      { x: 60, y: 3.2 },
    ],
    soils: [{ from: -40, to: 60, soil: 'clay' }],
    left: 0,
    right: 20,
    springLevel: 0.8,
    springRange: [0.5, 2],
    roadLeft: 5,
    roadRight: 5,
    maxGrade: 0.15,
    width: 5,
    pierZone: [8, 12],
    slope: 0.0008,
    manningN: 0.035,
    flood: { stage2: 1.6, stage100: 3.4, peakDay: 80 },
    seed: 1560,
  },
  env: { biome: 'alluvial-plain', water: 'green', latitude: 40.5, winter: 0.3, frost: 0.2, wet: 0.55, seed: 104 },
  stone: 'limestone',
  tools: ['rise', 'thickness', 'fullness', 'piers', 'pier-width', 'cover', 'piles', 'foundation'],
  limits: { minPiers: 0, maxPiers: 1, thickness: [0.4, 1.4], pierWidth: [2, 4], cover: [0.4, 1.2], foundation: [1.5, 4], minSpan: 6 },
  hazards: [
    { kind: 'flood', year: 1573, stage: 3.3, debris: 0.4, name: { tr: 'Ova taşkını', en: 'The flood of the plain' } },
    { kind: 'quake', year: 1719, pga: 0.25, name: { tr: 'İzmit depremi', en: 'The İzmit earthquake' } },
    { kind: 'load', year: 1810, axle: 90, actor: 'cannon', name: { tr: 'Topçu kolu', en: 'The artillery train' } },
    { kind: 'flood', year: 1850, stage: 4.5, debris: 0.6, name: { tr: 'Büyük taşkın', en: 'The great flood' } },
  ],
  traffic: [oldRoads(1560, 30), modernRoads(100)],
  parStones: 1500,
  starter: design({ springLevel: 0.8, spans: [span(4.2, 1, 0.9)], cover: 0.5, foundation: 2 }),
};

export const FIXTURES: Readonly<Record<'a' | 'b' | 'c' | 'd', LevelDef>> = { a: fixtureA, b: fixtureB, c: fixtureC, d: fixtureD };

/**
 * A long bridge for timing: `spans` equal spans on rock, sized so each ring has about forty
 * courses (the performance target of SimApi.insight).
 */
export function longBridge(spans: number): LevelDef {
  const clear = 12;
  const pierWidth = 3;
  const length = spans * clear + (spans - 1) * pierWidth;
  const piers = Array.from({ length: spans - 1 }, (_, i) => ({ x: (i + 1) * clear + i * pierWidth + pierWidth / 2, width: pierWidth }));
  return {
    ...fixtureC,
    id: 'millennium',
    index: 0,
    site: {
      ...fixtureC.site,
      ground: [
        { x: -2 * length, y: 5 },
        { x: -3, y: 4 },
        { x: 4, y: -1.5 },
        { x: length - 4, y: -1.5 },
        { x: length + 3, y: 4 },
        { x: 3 * length, y: 5 },
      ],
      soils: [],
      left: 0,
      right: length,
      pierZone: [4, length - 4],
      roadLeft: 7,
      roadRight: 7,
    },
    limits: { ...fixtureC.limits, minPiers: spans - 1, maxPiers: spans - 1 },
    starter: design({
      springLevel: 1.2,
      piers,
      spans: Array.from({ length: spans }, () => span(5, 1, 0.75)),
      linked: false,
      cover: 0.5,
      foundation: 2.5,
    }),
  };
}
