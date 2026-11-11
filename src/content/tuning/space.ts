/**
 * The design space a level's tools open, as a small vector of numbers, and the way back from that
 * vector to a BridgeDesign. Piers are spaced evenly, with the two end spans scaled by `edge` so a
 * search can push piers towards the banks (or away from them).
 */
import { clamp } from '../../core/math';
import type { BridgeDesign, LevelDef, PierDesign, SpanDesign } from '../../core/types';
import type { Rng } from '../../core/rng';

export interface Params {
  spring: number;
  piers: number;
  pierWidth: number;
  edge: number;
  /** Rise over clear span. */
  rise: number;
  fullness: number;
  thickness: number;
  cover: number;
  foundation: number;
  cutwaters: boolean;
  reliefs: boolean;
  clamps: boolean;
  piles: boolean;
}

export type NumericKey = 'spring' | 'piers' | 'pierWidth' | 'edge' | 'rise' | 'fullness' | 'thickness' | 'cover' | 'foundation';
export type ToggleKey = 'cutwaters' | 'reliefs' | 'clamps' | 'piles';

interface Range {
  readonly lo: number;
  readonly hi: number;
  readonly step: number;
}

export interface Space {
  readonly level: LevelDef;
  readonly ranges: Readonly<Record<NumericKey, Range>>;
  readonly toggles: readonly ToggleKey[];
}

const fixed = (v: number): Range => ({ lo: v, hi: v, step: 0 });

/** The ranges a player can actually reach on this level. */
export function spaceOf(level: LevelDef): Space {
  const has = (t: string): boolean => (level.tools as readonly string[]).includes(t);
  const s = level.starter;
  const lim = level.limits;
  const site = level.site;
  const piers = s.piers.length;
  const w0 = s.piers[0]?.width ?? lim.pierWidth[0];
  const span0 = s.spans[0]!;
  const toggles: ToggleKey[] = [];
  for (const t of ['cutwaters', 'reliefs', 'clamps', 'piles'] as const) if (has(t)) toggles.push(t);
  const canPier = has('piers') && lim.maxPiers > 0;
  return {
    level,
    toggles,
    ranges: {
      spring: has('spring') ? { lo: site.springRange[0], hi: site.springRange[1], step: 0.25 } : fixed(s.springLevel),
      piers: canPier ? { lo: lim.minPiers, hi: lim.maxPiers, step: 1 } : fixed(piers),
      pierWidth: has('pier-width') ? { lo: lim.pierWidth[0], hi: lim.pierWidth[1], step: 0.25 } : fixed(w0),
      edge: canPier && lim.minPiers !== lim.maxPiers ? { lo: 0.5, hi: 1.2, step: 0.1 } : canPier ? { lo: 0.7, hi: 1.2, step: 0.1 } : fixed(1),
      rise: has('rise') ? { lo: 0.1, hi: 0.7, step: 0.025 } : fixed(span0.rise / Math.max(1, site.right - site.left)),
      fullness: has('fullness') ? { lo: 0, hi: 1, step: 0.1 } : fixed(span0.fullness),
      thickness: has('thickness') ? { lo: lim.thickness[0], hi: lim.thickness[1], step: 0.05 } : fixed(span0.thickness),
      cover: has('cover') ? { lo: lim.cover[0], hi: lim.cover[1], step: 0.1 } : fixed(s.cover),
      foundation: has('foundation') ? { lo: lim.foundation[0], hi: lim.foundation[1], step: 0.25 } : fixed(s.foundation),
    },
  };
}

/** The starter design read back into the vector (an approximation for pier layouts). */
export function paramsOf(space: Space, design: BridgeDesign): Params {
  const level = space.level;
  const clearOf = (i: number): number => {
    const a = i === 0 ? level.site.left : design.piers[i - 1]!.x + design.piers[i - 1]!.width / 2;
    const b = i === design.piers.length ? level.site.right : design.piers[i]!.x - design.piers[i]!.width / 2;
    return Math.max(0.5, b - a);
  };
  const s = design.spans[0]!;
  return {
    spring: design.springLevel,
    piers: design.piers.length,
    pierWidth: design.piers[0]?.width ?? space.ranges.pierWidth.lo,
    edge: 1,
    rise: s.rise / clearOf(0),
    fullness: s.fullness,
    thickness: s.thickness,
    cover: design.cover,
    foundation: design.foundation,
    cutwaters: design.cutwaters,
    reliefs: design.reliefs,
    clamps: design.clamps,
    piles: design.piles,
  };
}

export function designOf(space: Space, p: Params): BridgeDesign {
  const site = space.level.site;
  const n = Math.round(p.piers);
  const w = p.pierWidth;
  const length = site.right - site.left;
  const inner = (length - n * w) / Math.max(1e-6, n - 1 + 2 * p.edge);
  const clears: number[] = [];
  const piers: PierDesign[] = [];
  let x = site.left;
  for (let i = 0; i <= n; i++) {
    const c = n === 0 ? length : i === 0 || i === n ? p.edge * inner : inner;
    clears.push(c);
    x += c;
    if (i < n) {
      piers.push({ x: x + w / 2, width: w });
      x += w;
    }
  }
  const equal = n === 0 || Math.abs(p.edge - 1) < 1e-9;
  const spans: SpanDesign[] = clears.map((c) => ({ rise: p.rise * c, fullness: p.fullness, thickness: p.thickness }));
  return {
    v: 1,
    springLevel: p.spring,
    piers,
    spans,
    linked: equal,
    cover: p.cover,
    foundation: p.foundation,
    cutwaters: p.cutwaters,
    reliefs: p.reliefs,
    clamps: p.clamps,
    piles: p.piles,
  };
}

const NUMERIC: readonly NumericKey[] = ['spring', 'piers', 'pierWidth', 'edge', 'rise', 'fullness', 'thickness', 'cover', 'foundation'];

export function numericKeys(space: Space): NumericKey[] {
  return NUMERIC.filter((k) => space.ranges[k].step > 0);
}

function snap(r: Range, v: number): number {
  if (r.step <= 0) return r.lo;
  return clamp(r.lo + Math.round((v - r.lo) / r.step) * r.step, r.lo, r.hi);
}

export function randomParams(space: Space, rng: Rng): Params {
  const r = space.ranges;
  const pick = (k: NumericKey): number => snap(r[k], rng.range(r[k].lo, r[k].hi + (r[k].step > 0 ? 1e-9 : 0)));
  const on = (k: ToggleKey): boolean => space.toggles.includes(k) && rng.chance(0.5);
  return {
    spring: pick('spring'),
    piers: pick('piers'),
    pierWidth: pick('pierWidth'),
    edge: pick('edge'),
    rise: pick('rise'),
    fullness: pick('fullness'),
    thickness: pick('thickness'),
    cover: pick('cover'),
    foundation: pick('foundation'),
    cutwaters: on('cutwaters'),
    reliefs: on('reliefs'),
    clamps: on('clamps'),
    piles: on('piles'),
  };
}

/** Every neighbour one step away along one parameter (or with one toggle flipped). */
export function neighbours(space: Space, p: Params): Params[] {
  const out: Params[] = [];
  for (const k of numericKeys(space)) {
    const r = space.ranges[k];
    for (const dir of [-1, 1]) {
      const v = snap(r, p[k] + dir * r.step);
      if (Math.abs(v - p[k]) > 1e-9) out.push({ ...p, [k]: v });
    }
  }
  for (const t of space.toggles) out.push({ ...p, [t]: !p[t] });
  return out;
}

export function describe(p: Params): string {
  const parts = [
    `rise ${p.rise.toFixed(3)}`,
    `full ${p.fullness.toFixed(1)}`,
    `t ${p.thickness.toFixed(2)}`,
    `cover ${p.cover.toFixed(1)}`,
    `spring ${p.spring.toFixed(2)}`,
  ];
  if (p.piers > 0) parts.push(`piers ${p.piers}x${p.pierWidth.toFixed(2)} edge ${p.edge.toFixed(1)} fdn ${p.foundation.toFixed(2)}`);
  for (const t of ['cutwaters', 'reliefs', 'clamps', 'piles'] as const) if (p[t]) parts.push(t);
  return parts.join(', ');
}
