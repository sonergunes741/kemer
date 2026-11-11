/**
 * Bin Yıl: a forty-five metre river built over in 1026, one clay bank and one of rock, a gravel
 * bed. In every second century a flood, an earthquake and a heavy load, each larger than the one
 * before. Every tool is open; the fewest stones win.
 */
import type { HazardDef, LevelDef } from '../core/types';
import { NAMES, design, eras, flood, load, quake, span } from './kit';

const LOADS = [
  { actor: 'caravan', name: { tr: 'ağır kervan', en: 'heavy caravan' } },
  { actor: 'caravan', name: { tr: 'ağır kervan', en: 'heavy caravan' } },
  { actor: 'cannon', name: { tr: 'sefer topları', en: 'campaign guns' } },
  { actor: 'cannon', name: { tr: 'kuşatma topları', en: 'siege guns' } },
  { actor: 'truck', name: { tr: 'ağır kamyon', en: 'heavy lorry' } },
] as const;

function centuries(): HazardDef[] {
  const out: HazardDef[] = [];
  for (let k = 0; k < 5; k++) {
    const c = 1100 + 200 * k;
    out.push(flood(c + 31, 4 + 0.4 * k, 0.3 + 0.1 * k, 'spring', NAMES.flood));
    out.push(quake(c + 57, 0.06 + 0.05 * k, 'summer', { tr: 'deprem', en: 'earthquake' }));
    const l = LOADS[k]!;
    out.push(load(c + 83, 30 + 20 * k, l.actor, 'autumn', l.name));
  }
  return out;
}

export const MILLENNIUM: LevelDef = {
  id: 'millennium',
  index: 0,
  year: 1026,
  endYear: 2026,
  passYears: 30,
  river: { tr: 'Bin Yıl Irmağı', en: 'River of a Thousand Years' },
  place: { tr: 'Anadolu', en: 'Anatolia' },
  builder: { tr: 'Ağırnaslı bir usta', en: 'A mason of Ağırnas' },
  site: {
    ground: [
      { x: -75, y: 8.2 },
      { x: -40, y: 7.2 },
      { x: -12, y: 6.4 },
      { x: -4, y: 6.1 },
      { x: -1.2, y: 5.6 },
      { x: 0, y: 2.4 },
      { x: 3, y: 0.3 },
      { x: 8, y: -1.2 },
      { x: 18, y: -1.9 },
      { x: 27, y: -2 },
      { x: 37, y: -1.4 },
      { x: 42, y: -0.2 },
      { x: 44.4, y: 1.2 },
      { x: 45, y: 3 },
      { x: 45.6, y: 6 },
      { x: 50, y: 6.3 },
      { x: 80, y: 7.4 },
      { x: 120, y: 8.6 },
    ],
    soils: [
      { from: -75, to: 1, soil: 'clay' },
      { from: 1, to: 44, soil: 'gravel' },
    ],
    left: 0,
    right: 45,
    springLevel: 1.2,
    springRange: [0.5, 4],
    roadLeft: 6.1,
    roadRight: 6.2,
    maxGrade: 0.15,
    width: 5,
    pierZone: [4, 41],
    slope: 0.002,
    manningN: 0.035,
    flood: { stage2: 1.6, stage100: 3.8, peakDay: 110 },
    seed: 1026,
  },
  env: { biome: 'steppe-river', water: 'green', latitude: 39.5, winter: 0.6, frost: 0.5, wet: 0.3, seed: 1026 },
  stone: 'andesite',
  tools: ['rise', 'thickness', 'fullness', 'cover', 'piers', 'pier-width', 'cutwaters', 'foundation', 'reliefs', 'spring', 'clamps', 'piles'],
  limits: { minPiers: 0, maxPiers: 4, thickness: [0.4, 2], pierWidth: [2, 5], cover: [0.3, 2], foundation: [1, 5], minSpan: 6 },
  hazards: centuries(),
  traffic: eras(1026, { caravan: true }),
  parStones: 4997,
  starter: design({
    springLevel: 1.2,
    piers: [
      { x: 15, width: 3 },
      { x: 30, width: 3 },
    ],
    spans: [span(4.5, 1, 0.7), span(4.5, 1, 0.7), span(4.5, 1, 0.7)],
    cover: 0.5,
    foundation: 2.5,
    cutwaters: true,
  }),
};
