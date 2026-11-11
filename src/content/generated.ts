/**
 * Generated rivers. Günün Nehri: one river per calendar date, seeded from the date alone so every
 * player meets the same water; its par comes from a short search with the real simulation.
 * Bin Yıl: a fixed river built in 1026 that a flood, an earthquake and a heavy load test in every
 * second century, each larger than the last.
 */
import type { SimApi } from '../core/contracts';
import { Rng, hashString } from '../core/rng';
import type { BiomeId, HazardDef, LevelDef, SoilId, SoilZone, StoneId, ToolId, Vec2, WaterTint } from '../core/types';
import { design, eras, evenPiers, flood, quake, span, type Season } from './kit';
import { DEFAULT_SEARCH, Evaluator, cheapest, stands } from './tuning/search';

interface Profile {
  readonly biome: BiomeId;
  readonly water: readonly WaterTint[];
  readonly stone: StoneId;
  readonly soils: readonly SoilId[];
  readonly width: readonly [number, number];
  readonly form: 'gorge' | 'valley' | 'plain';
  readonly latitude: number;
  readonly climate: readonly [winter: number, frost: number, wet: number];
  readonly peakDay: number;
}

const PROFILES: readonly Profile[] = [
  { biome: 'tuff-valley', water: ['clear'], stone: 'tuff', soils: ['rock'], width: [8, 22], form: 'valley', latitude: 38.7, climate: [0.5, 0.4, 0.2], peakDay: 110 },
  { biome: 'steppe-river', water: ['red', 'green'], stone: 'andesite', soils: ['rock', 'gravel'], width: [12, 60], form: 'valley', latitude: 39.2, climate: [0.6, 0.5, 0.2], peakDay: 100 },
  { biome: 'green-valley', water: ['green'], stone: 'limestone', soils: ['gravel'], width: [20, 70], form: 'valley', latitude: 40.3, climate: [0.4, 0.3, 0.5], peakDay: 95 },
  { biome: 'basalt-plain', water: ['brown'], stone: 'basalt', soils: ['gravel', 'sand'], width: [30, 90], form: 'plain', latitude: 37.9, climate: [0.3, 0.2, 0.2], peakDay: 100 },
  { biome: 'limestone-gorge', water: ['turquoise'], stone: 'limestone', soils: ['rock'], width: [15, 34], form: 'gorge', latitude: 38.1, climate: [0.3, 0.2, 0.3], peakDay: 95 },
  { biome: 'highland', water: ['clear'], stone: 'andesite', soils: ['gravel'], width: [20, 90], form: 'valley', latitude: 40, climate: [1, 1, 0.3], peakDay: 140 },
  { biome: 'canyon', water: ['green'], stone: 'tuff', soils: ['rock'], width: [12, 34], form: 'gorge', latitude: 40.5, climate: [0.9, 0.8, 0.2], peakDay: 135 },
  { biome: 'rain-forest', water: ['milky'], stone: 'granite', soils: ['rock'], width: [8, 30], form: 'gorge', latitude: 41, climate: [0.5, 0.3, 1], peakDay: 290 },
  { biome: 'alluvial-plain', water: ['brown'], stone: 'limestone', soils: ['clay', 'sand'], width: [30, 90], form: 'plain', latitude: 40.5, climate: [0.3, 0.2, 0.6], peakDay: 60 },
  { biome: 'flood-plain', water: ['green'], stone: 'limestone', soils: ['sand'], width: [40, 90], form: 'plain', latitude: 41.7, climate: [0.4, 0.3, 0.5], peakDay: 45 },
];

function seasonOfDay(day: number): Season {
  if (day < 59 || day >= 335) return 'winter';
  if (day < 151) return 'spring';
  if (day < 243) return 'summer';
  return 'autumn';
}

const round = (v: number, step: number): number => Math.round(v / step) * step;

/** A valley section from its measures: bank tops, a sloping or sheer bank, a bed, terraces beyond. */
function section(w: number, banks: number, bed: number, spring: number, form: Profile['form'], rng: Rng): Vec2[] {
  const reach = Math.max(14, 1.6 * w + 6);
  const run = form === 'gorge' ? 0.6 : form === 'valley' ? 0.08 * w + 1 : 0.04 * w + 1.5;
  const rise = form === 'plain' ? 0.6 : form === 'valley' ? 1.6 : 3.5;
  const tilt = rng.range(-0.08, 0.08) * w;
  const foot = Math.max(0.3, spring - 0.1);
  const left: Vec2[] = [
    { x: -reach, y: banks + rise },
    { x: -0.5 * reach, y: banks + 0.45 * rise },
    { x: -run - 2, y: banks + 0.1 },
    { x: -run, y: banks },
    { x: 0, y: foot },
    { x: 0.08 * w, y: 0 },
    { x: 0.25 * w + tilt, y: -0.7 * bed },
    { x: 0.5 * w + tilt, y: -bed },
  ];
  const right = left.slice(0, -1).map((p, i) => ({ x: w - p.x, y: i === 6 ? -0.8 * bed : p.y })).reverse();
  return [...left, ...right];
}

function soilZones(w: number, reach: number, bed: SoilId, bank: SoilId): SoilZone[] {
  const zones: SoilZone[] = [];
  if (bank !== 'rock') zones.push({ from: -reach, to: 0.05 * w, soil: bank }, { from: 0.95 * w, to: w + reach, soil: bank });
  if (bed !== 'rock') zones.push({ from: 0.05 * w, to: 0.95 * w, soil: bed });
  return zones;
}

function tools(w: number, piers: boolean, soft: boolean): ToolId[] {
  const out: ToolId[] = ['rise', 'thickness', 'fullness', 'cover'];
  if (w >= 15) out.push('reliefs', 'spring', 'clamps');
  if (piers) out.push('piers', 'pier-width', 'cutwaters', 'foundation');
  if (piers && soft) out.push('piles');
  return out;
}

/** The river of a date (YYYY-MM-DD). Pure: the same date always gives the same river. */
export function makeDaily(sim: SimApi, date: string): LevelDef {
  const seed = hashString(`kemer:daily:${date}`);
  const rng = new Rng(seed);
  const p = rng.pick(PROFILES);
  const w = round(Math.min(90, Math.max(8, rng.range(p.width[0], p.width[1]))), 0.5);
  const piers = w >= 35;
  const gorge = p.form === 'gorge';
  const banks = round(gorge ? rng.range(6, 13) : rng.range(2.5, 5.5), 0.1);
  const bed = round(rng.range(0.6, Math.min(3, 0.6 + w / 30)), 0.1);
  const bedSoil = rng.pick(p.soils);
  const bankSoil: SoilId = bedSoil === 'clay' ? 'clay' : bedSoil === 'sand' && p.form === 'plain' ? 'clay' : 'rock';
  const spring = round(gorge ? rng.range(1.5, 3) : rng.range(0.6, 1.2), 0.1);
  const stage2 = round(Math.min(banks * 0.5, rng.range(0.4, 0.8) + w / 60), 0.1);
  const stage100 = round(Math.min(banks + 0.8, stage2 * rng.range(2, 2.6)), 0.1);
  const year = rng.int(1100, 1700);
  const season = seasonOfDay(p.peakDay);
  const hazards: HazardDef[] = [];
  const floods = rng.int(2, 4);
  for (let i = 0; i < floods; i++) {
    const y = rng.int(year + 30, 2020);
    if (hazards.some((h) => h.year === y)) continue;
    hazards.push(flood(y, round(stage100 * rng.range(1.02, 1.3), 0.05), round(rng.range(0.2, 0.7), 0.1), season));
  }
  const quakes = rng.int(0, 2);
  for (let i = 0; i < quakes; i++) {
    const y = rng.int(year + 30, 2020);
    if (hazards.some((h) => h.year === y)) continue;
    hazards.push(quake(y, round(rng.range(0.04, 0.24), 0.01), null, { tr: 'deprem', en: 'earthquake' }));
  }
  hazards.sort((a, b) => a.year - b.year);
  const minPiers = piers ? Math.max(1, Math.ceil(w / 30) - 1) : 0;
  const maxPiers = piers ? Math.max(minPiers, Math.floor(w / 9)) : 0;
  const pierCount = piers ? Math.max(minPiers, Math.round(w / 18)) : 0;
  const pierW = piers ? 2.5 : 1;
  const clear = (w - pierCount * pierW) / (pierCount + 1);
  const ground = section(w, banks, bed, spring, p.form, rng);
  const reach = -ground[0]!.x;
  const thickness: readonly [number, number] = [round(Math.max(0.25, clear / 40), 0.05), round(Math.max(1, clear / 12), 0.05)];
  const base: LevelDef = {
    id: 'daily',
    index: 0,
    year,
    endYear: 2026,
    passYears: 30,
    river: { tr: 'Günün Nehri', en: 'River of the Day' },
    place: { tr: date, en: date },
    builder: { tr: 'Ağırnaslı bir usta', en: 'A mason of Ağırnas' },
    site: {
      ground,
      soils: soilZones(w, reach + w, bedSoil, bankSoil),
      left: 0,
      right: w,
      springLevel: spring,
      springRange: gorge ? [1, Math.min(banks - 2, 7)] : [0.5, Math.max(1.5, spring + 1)],
      roadLeft: banks,
      roadRight: banks,
      maxGrade: w < 20 ? 0.3 : w < 40 ? 0.2 : 0.12,
      width: round(Math.min(6, 3 + w / 30), 0.5),
      pierZone: piers ? [4, w - 4] : [w / 2, w / 2],
      slope: round(gorge ? rng.range(0.004, 0.012) : rng.range(0.0006, 0.003), 0.0001),
      manningN: gorge ? 0.045 : 0.035,
      flood: { stage2, stage100, peakDay: p.peakDay },
      seed: seed % 100000,
    },
    env: { biome: p.biome, water: rng.pick(p.water), latitude: p.latitude, winter: p.climate[0], frost: p.climate[1], wet: p.climate[2], seed: seed % 9973 },
    stone: p.stone,
    tools: tools(w, piers, bedSoil !== 'rock' && bedSoil !== 'gravel'),
    limits: {
      minPiers,
      maxPiers,
      thickness,
      pierWidth: piers ? [2, 4.5] : [1, 1],
      cover: [0.3, 1.2],
      foundation: piers ? [1, 4] : [1, 1],
      minSpan: Math.min(6, w / 2),
    },
    hazards,
    traffic: eras(year, { village: w < 15 }),
    parStones: 0,
    starter: design({
      springLevel: spring,
      piers: piers ? evenPiers(0, w, pierCount + 1, pierW) : [],
      spans: Array.from({ length: pierCount + 1 }, () => span(0.3 * clear, 1, Math.max(thickness[0], round(clear / 20 + 0.2, 0.05)))),
      cover: 0.5,
      foundation: piers ? 2 : 1,
      cutwaters: piers,
    }),
  };
  return withPar(sim, withSafeStarter(sim, base));
}

/**
 * A sensible first design: lower the rise until the road is not too steep, then thicken the ring
 * and widen the piers until it carries itself with some margin.
 */
function withSafeStarter(sim: SimApi, level: LevelDef): LevelDef {
  let starter = sim.normalize(level, level.starter);
  for (let i = 0; i < 12 && sim.validate(level, starter).length > 0; i++) {
    starter = sim.normalize(level, { ...starter, spans: starter.spans.map((s) => ({ ...s, rise: s.rise * 0.85 })) });
  }
  for (let i = 0; i < 8 && sim.insight(level, starter).safety < 1.3; i++) {
    const thicker = sim.normalize(level, {
      ...starter,
      spans: starter.spans.map((s) => ({ ...s, thickness: s.thickness * 1.15 })),
      piers: starter.piers.map((p) => ({ ...p, width: p.width + 0.25 })),
    });
    if (sim.validate(level, thicker).length > 0) break;
    starter = thicker;
  }
  return { ...level, starter };
}

/** Par: 15 % over the cheapest design a short search finds standing in 2026 without repairs. */
function withPar(sim: SimApi, level: LevelDef): LevelDef {
  const ev = new Evaluator(sim, level, Infinity);
  const found = cheapest(ev, stands, 'none', { ...DEFAULT_SEARCH, samples: 10, keep: 1, budget: 14, seed: level.site.seed });
  const fallback = sim.insight(level, level.starter).stones.total * 1.3;
  const par = Math.ceil((found ? found.outcome.stones : fallback) * 1.15);
  return { ...level, parStones: par };
}
