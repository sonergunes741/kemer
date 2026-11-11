/**
 * The search over designs used to balance the levels and to set the daily river's par: seeded
 * random samples over the level's design space, then greedy refinement of the cheapest designs
 * that meet a goal. Deterministic for a given seed.
 */
import type { SimApi } from '../../core/contracts';
import { Rng } from '../../core/rng';
import type { LevelDef } from '../../core/types';
import { designOf, neighbours, paramsOf, randomParams, spaceOf, type Params, type Space } from './space';
import { trial, type Outcome, type RepairPolicy } from './trial';

export interface Found {
  readonly params: Params;
  readonly outcome: Outcome;
}

export type Goal = (o: Outcome) => boolean;

/** Caches every trial, so goals that share a policy share runs. */
export class Evaluator {
  // Plain fields, not parameter properties: the balance script runs under Node's type stripping.
  readonly sim: SimApi;
  readonly level: LevelDef;
  readonly par: number;
  readonly space: Space;
  private readonly cache = new Map<string, Outcome | null>();
  runs = 0;

  constructor(sim: SimApi, level: LevelDef, par = level.parStones) {
    this.sim = sim;
    this.level = level;
    this.par = par;
    this.space = spaceOf(level);
  }

  /** null when the design cannot be built as asked (validation issues). */
  eval(p: Params, policy: RepairPolicy): Outcome | null {
    const key = `${policy}|${JSON.stringify(p)}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const design = this.sim.normalize(this.level, designOf(this.space, p));
    let out: Outcome | null = null;
    if (this.sim.validate(this.level, design).length === 0) {
      this.runs++;
      out = trial(this.sim, this.level, design, policy, this.par);
    }
    this.cache.set(key, out);
    return out;
  }

  starter(): Params {
    return paramsOf(this.space, this.level.starter);
  }
}

export interface SearchOptions {
  readonly samples: number;
  readonly seed: number;
  /** Designs refined after sampling. */
  readonly keep: number;
  /** Most neighbour evaluations per refinement. */
  readonly budget: number;
  /** Extra starting points (the starter, earlier finds). */
  readonly seeds?: readonly Params[];
}

export const DEFAULT_SEARCH: SearchOptions = { samples: 220, seed: 1, keep: 3, budget: 160 };

/** Cheapest design meeting `goal` under `policy`, or null if none was found. */
export function cheapest(ev: Evaluator, goal: Goal, policy: RepairPolicy, options: SearchOptions = DEFAULT_SEARCH): Found | null {
  const rng = new Rng(options.seed);
  const pool: Found[] = [];
  const consider = (p: Params): void => {
    const o = ev.eval(p, policy);
    if (o && goal(o)) pool.push({ params: p, outcome: o });
  };
  for (const p of options.seeds ?? []) consider(p);
  consider(ev.starter());
  for (let i = 0; i < options.samples; i++) consider(randomParams(ev.space, rng));
  pool.sort((a, b) => a.outcome.stones - b.outcome.stones);
  let best: Found | null = null;
  const starts = pool.slice(0, options.keep);
  for (const start of starts) {
    const found = refine(ev, start, goal, policy, options.budget);
    if (!best || found.outcome.stones < best.outcome.stones) best = found;
  }
  return best;
}

/** Greedy descent: move to the cheapest neighbour that still meets the goal, until none is cheaper. */
export function refine(ev: Evaluator, start: Found, goal: Goal, policy: RepairPolicy, budget: number): Found {
  let current = start;
  let spent = 0;
  for (;;) {
    let next: Found | null = null;
    for (const p of neighbours(ev.space, current.params)) {
      if (spent++ >= budget) return next && next.outcome.stones < current.outcome.stones ? next : current;
      const o = ev.eval(p, policy);
      if (!o || !goal(o) || o.stones >= current.outcome.stones) continue;
      if (!next || o.stones < next.outcome.stones) next = { params: p, outcome: o };
    }
    if (!next) return current;
    current = next;
  }
}

export const passes: Goal = (o) => o.summary.passed;
export const stands: Goal = (o) => o.summary.seals.standing;
/** Repairs in nine centuries a careful player makes: the par leaves room for this many. */
export const CAREFUL_REPAIRS = 4;
/**
 * Standing in 2026 with no more than CAREFUL_REPAIRS repairs. With repairs priced by the work they
 * do, a thin ring mended every few decades is often the cheapest bridge of all; a par set from it
 * would leave a player who builds to last and repairs three or four times no lean seal.
 */
export const standsCarefully: Goal = (o) => o.summary.seals.standing && o.summary.repairs <= CAREFUL_REPAIRS;
export const unrepairedStanding: Goal = (o) => o.summary.seals.standing && o.summary.seals.unrepaired;
