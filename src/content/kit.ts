/**
 * Small builders shared by the level files: designs, traffic eras and named hazards. Named
 * hazards also record the season they struck in, because HazardDef has no field for it and the
 * epitaph ("1683 bahar selinde yıkıldı.") needs it.
 */
import type { ActorKind, BridgeDesign, HazardDef, LocalText, SpanDesign, TrafficEra } from '../core/types';

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

export const span = (rise: number, fullness: number, thickness: number): SpanDesign => ({ rise, fullness, thickness });

/** A design with the quiet defaults filled in. */
export function design(partial: Partial<BridgeDesign> & Pick<BridgeDesign, 'springLevel' | 'spans'>): BridgeDesign {
  return {
    v: 1,
    piers: [],
    linked: true,
    cover: 0.5,
    foundation: 1,
    cutwaters: false,
    reliefs: false,
    clamps: false,
    piles: false,
    ...partial,
  };
}

/** Equal spans between site.left and site.right with `count - 1` piers of width `w`. */
export function evenPiers(left: number, right: number, count: number, w: number): { x: number; width: number }[] {
  const clear = (right - left - (count - 1) * w) / count;
  return Array.from({ length: count - 1 }, (_, i) => ({ x: left + (i + 1) * clear + i * w + w / 2, width: w }));
}

/* -- traffic -------------------------------------------------------------------------------- */

export interface EraOptions {
  /** Village paths never carry lorries: the motor era is capped at 25 kN and has no trucks. */
  readonly village?: boolean;
  /** Caravan roads carry caravans from the first year. */
  readonly caravan?: boolean;
  /** Replace the eras from this year on (Uzunköprü's lorry ban and closure). */
  readonly tail?: readonly TrafficEra[];
}

/** The common traffic table of LEVELS.md, trimmed to the build year. Intervals are [from, to). */
export function eras(year: number, options: EraOptions = {}): TrafficEra[] {
  const first: ActorKind[] = options.caravan ? ['villager', 'donkey', 'ox-cart', 'caravan'] : ['villager', 'donkey', 'ox-cart'];
  const table: TrafficEra[] = [
    { from: -Infinity, to: 1300, actors: first, axle: 12 },
    { from: 1300, to: 1600, actors: ['villager', 'ox-cart', 'caravan', 'rider'], axle: 15 },
    { from: 1600, to: 1850, actors: ['villager', 'ox-cart', 'caravan', 'rider', 'army'], axle: 20 },
    { from: 1850, to: 1920, actors: ['villager', 'ox-cart', 'carriage', 'rider'], axle: 25 },
    options.village
      ? { from: 1920, to: 1980, actors: ['villager', 'ox-cart', 'cyclist'], axle: 25 }
      : { from: 1920, to: 1980, actors: ['villager', 'ox-cart', 'truck', 'cyclist'], axle: 80 },
    { from: 1980, to: 2027, actors: ['villager', 'cyclist'], axle: 5 },
  ];
  const tailFrom = options.tail?.[0]?.from ?? Infinity;
  const out: TrafficEra[] = [];
  for (const era of table) {
    if (era.to <= year || era.from >= tailFrom) continue;
    out.push({ ...era, from: Math.max(era.from, year), to: Math.min(era.to, tailFrom) });
  }
  if (options.tail) out.push(...options.tail);
  return out;
}

/* -- named hazards ---------------------------------------------------------------------------- */

const seasons = new Map<string, Season>();

/** Generated rivers reuse years and leave floods unnamed, so the size is part of the key too. */
function keyOf(h: HazardDef): string {
  const size = h.kind === 'flood' ? h.stage : h.kind === 'quake' ? h.pga : h.axle;
  return `${h.kind}:${h.year}:${h.name?.tr ?? ''}:${size}`;
}

function remember<T extends HazardDef>(hazard: T, season: Season | null): T {
  if (season) seasons.set(keyOf(hazard), season);
  return hazard;
}

/** The season a hazard struck in, when the ledger knows it. Works on copies (saved runs) too. */
export function seasonOf(hazard: HazardDef | undefined): Season | null {
  return hazard ? (seasons.get(keyOf(hazard)) ?? null) : null;
}

/** The generated rivers leave their floods without a name: the caption then shows the year alone. */
export function flood(year: number, stage: number, debris: number, season: Season | null, name?: LocalText): HazardDef {
  return remember(name ? { kind: 'flood', year, stage, debris, name } : { kind: 'flood', year, stage, debris }, season);
}

export function quake(year: number, pga: number, season: Season | null, name?: LocalText): HazardDef {
  return remember(name ? { kind: 'quake', year, pga, name } : { kind: 'quake', year, pga }, season);
}

export function load(year: number, axle: number, actor: ActorKind, season: Season | null, name?: LocalText): HazardDef {
  return remember(name ? { kind: 'load', year, axle, actor, name } : { kind: 'load', year, axle, actor }, season);
}

/** Hazard names the ledger uses again and again. */
export const NAMES = {
  springFlood: { tr: 'bahar seli', en: 'spring flood' },
  autumnFlood: { tr: 'güz seli', en: 'autumn flood' },
  winterFlood: { tr: 'kış seli', en: 'winter flood' },
  snowmelt: { tr: 'kar suyu seli', en: 'snowmelt flood' },
  flood: { tr: 'büyük sel', en: 'great flood' },
} as const satisfies Record<string, LocalText>;

/** The Gumbel law the simulation fits to a flood regime: stage of the flood with return period T. */
export function gumbelStage(stage2: number, stage100: number, period: number): number {
  const beta = (stage100 - stage2) / 4.2336;
  const mu = stage2 - 0.3665 * beta;
  return mu - beta * Math.log(-Math.log(1 - 1 / period));
}
