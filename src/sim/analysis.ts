/**
 * Everything the design screen asks about one design: the quick insight (every pointer move),
 * the fuller capacities (on release) and what striking the centering does (SIM-SPEC 5, 6, 7).
 * One Analysis per (level, normalized design); results are computed once and kept.
 */
import type {
  BridgeDesign,
  BridgeGeometry,
  Capacities,
  CauseId,
  CollapseInfo,
  DesignIssue,
  Hinge,
  Insight,
  LevelDef,
  SpanInsight,
  StoneCount,
  StrikeResult,
  Vec2,
} from '../core/types';
import { BridgeModel } from './bridge';
import { collapseFrom } from './collapse';
import type { Layout } from './geometry';
import { bridgeGeometry, buildLayout, countStones } from './geometry';
import { axleFootprint } from './loads';
import { completeMechanism } from './mechanism';
import { spreadCapacity } from './movement';
import { crushingUse, gsfOf, meanStress, solveAlpha, solveThrust } from './ring';
import { centreLine, hingesOf, thrustLine } from './rows';
import { pierStabilities } from './stability';
import type { Mechanism } from './transient';
import { axleCapacityAt, quakeCapacity } from './transient';
import {
  AXLE_POSITIONS,
  DECISION_TOL,
  JOINT_CLOSE,
  PILES_DEPTH,
  SETTLE_SIGMA_REF,
} from './tuning';
import { validateWith } from './validate';
import { Waterway, floodStage } from './water';

/** Finite stand-ins for "no limit" in reported capacities. */
const AXLE_CAP = 1e5;
const QUAKE_CAP = 5;

export interface SpanDead {
  /** alpha_min and gsf under dead load. */
  readonly alpha: number;
  readonly gsf: number;
  /** Minimum horizontal thrust, kN per metre of width. */
  readonly thrust: number;
  readonly crushing: number;
  /** Mean joint stress at minimum thrust, kPa. */
  readonly meanStress: number;
  readonly line: readonly Vec2[];
  readonly hinges: readonly Hinge[];
}

/** Dead-load answers for the current state of a model: each ring, then the piers. */
export function analyseDead(model: BridgeModel, spans: SpanDead[], piers: number[]): number {
  const { ws, law } = model;
  let safety = Infinity;
  spans.length = 0;
  for (const sp of model.spans) {
    const alpha = solveAlpha(ws, sp, law);
    const gsf = gsfOf(alpha);
    const X = sp.sol[0] as number;
    const Y = sp.sol[1] as number;
    const m = sp.sol[2] as number;
    const usable = alpha !== Infinity;
    // One point per joint whatever happens (SpanInsight.thrustLine): the centres when no line exists.
    const line = usable ? thrustLine(sp, X, Y, m, 0) : centreLine(sp);
    const hinges = usable ? hingesOf(sp, X, Y, m, 0, alpha, law) : [];
    const crushing = usable ? crushingUse(ws, sp, law) : 0;
    // Minimum thrust at alpha = 1; a ring that cannot stand reports the thrust of its best line.
    let thrust = X * sp.W;
    if (solveThrust(ws, sp, law, 1, 1) === 'optimal') thrust = (sp.sol[0] as number) * sp.W;
    else if (usable) {
      sp.sol[0] = X;
      sp.sol[1] = Y;
      sp.sol[2] = m;
    }
    spans.push({ alpha, gsf, thrust, crushing, meanStress: usable ? meanStress(ws, sp) : 0, line, hinges });
    if (gsf < safety) safety = gsf;
  }
  pierStabilities(model, piers);
  for (const s of piers) if (s < safety) safety = s;
  return safety;
}

/** True when a margin is below 1 by more than the decision tolerance. */
export function fails(margin: number): boolean {
  return margin < 1 - DECISION_TOL;
}

export class Analysis {
  readonly level: LevelDef;
  /** Normalized design. */
  readonly design: BridgeDesign;
  readonly layout: Layout;
  readonly model: BridgeModel;
  readonly stones: StoneCount;
  readonly spans: SpanDead[] = [];
  readonly piers: number[] = [];
  readonly safety: number;
  private geometryCache: BridgeGeometry | null = null;
  private capacitiesCache: Capacities | null = null;
  private strikeCache: StrikeResult | null = null;
  private waterwayCache: Waterway | null = null;
  /** Worst axle position per span (x, footprint), found by capacities(). */
  readonly axleSpots: { x: number; length: number; width: number }[] = [];

  constructor(level: LevelDef, design: BridgeDesign) {
    this.level = level;
    this.design = design;
    this.layout = buildLayout(level, design);
    this.stones = countStones(this.layout);
    this.model = new BridgeModel(this.layout);
    this.safety = analyseDead(this.model, this.spans, this.piers);
  }

  geometry(): BridgeGeometry {
    return (this.geometryCache ??= bridgeGeometry(this.layout, this.stones));
  }

  waterway(): Waterway {
    return (this.waterwayCache ??= new Waterway(this.layout));
  }

  insight(raw: BridgeDesign): Insight {
    const issues: DesignIssue[] = validateWith(this.level, raw, this.layout.steepest);
    const spans: SpanInsight[] = this.spans.map((s) => ({ gsf: s.gsf, thrustLine: s.line, hinges: s.hinges, thrust: s.thrust, crushing: s.crushing }));
    return { issues, spans, piers: this.piers.map((stability) => ({ stability })), safety: this.safety, stones: this.stones };
  }

  /** Worst axle position of every span and the capacity there (fills axleSpots). */
  private axle(): number {
    const { model, layout } = this;
    let worst = Infinity;
    this.axleSpots.length = 0;
    for (let i = 0; i < model.count; i++) {
      const a = layout.shapes[i]!;
      let spanWorst = Infinity;
      let spot = { x: a.xc, length: 1, width: 1 };
      for (let k = 1; k <= AXLE_POSITIONS; k++) {
        const x = a.xL + (a.span * k) / (AXLE_POSITIONS + 1);
        const fp = axleFootprint(layout, a, x);
        const cap = axleCapacityAt(model, i, x, fp.length, fp.width);
        if (cap < spanWorst) {
          spanWorst = cap;
          spot = { x, length: fp.length, width: fp.width };
        }
      }
      this.axleSpots.push(spot);
      if (spanWorst < worst) worst = spanWorst;
    }
    return worst;
  }

  capacities(): Capacities {
    if (this.capacitiesCache) return this.capacitiesCache;
    const { model, layout, level } = this;
    const water = this.waterway();
    const stage100 = floodStage(level, 100);
    let crown = Infinity;
    for (const a of layout.shapes) crown = Math.min(crown, a.ys + a.rise);
    const flood = water.flood(stage100, 0, { stage: 0, level: 0, velocity: 0, overtopped: false });
    let scour = 0;
    for (let i = 0; i < layout.piers.length; i++) {
      const depth = layout.design.foundation + (layout.design.piles ? PILES_DEPTH : 0);
      scour = Math.max(scour, water.scour(i, flood, 0) / Math.max(0.1, depth));
    }
    let spread = Infinity;
    for (const sp of model.spans) spread = Math.min(spread, spreadCapacity(model.ws, sp, model.law));
    const result: Capacities = {
      axle: Math.min(AXLE_CAP, this.axle()),
      quake: Math.min(QUAKE_CAP, quakeCapacity(model)),
      floodFree: water.stageReaching(crown),
      waterway: water.openShare(stage100),
      scour,
      spread,
    };
    this.capacitiesCache = result;
    return result;
  }

  /** Axle spots, computing them if capacities() has not run yet. */
  spots(): readonly { x: number; length: number; width: number }[] {
    if (this.axleSpots.length === 0) this.capacities();
    return this.axleSpots;
  }

  strike(): StrikeResult {
    if (this.strikeCache) return this.strikeCache;
    const { model, level } = this;
    const failingSpans = this.spans.map((s) => fails(s.gsf));
    const failingPiers = this.piers.map((s) => fails(s));
    let result: StrikeResult;
    if (!failingSpans.includes(true) && !failingPiers.includes(true)) {
      // The ring settles as its joints close under the first load they have ever felt.
      const settle = this.spans.map((s, i) => {
        const a = this.layout.shapes[i]!;
        return JOINT_CLOSE * (a.n + 1) * Math.sqrt(Math.max(0, s.meanStress) / SETTLE_SIGMA_REF) * (a.span / (4 * a.rise));
      });
      result = { stands: true, settle };
    } else {
      const first: Mechanism = { spans: new Map(), piers: [] };
      let crushingOnly = !failingPiers.includes(true);
      for (let i = 0; i < this.spans.length; i++) {
        if (!failingSpans[i]) continue;
        first.spans.set(i, completeMechanism(model.ws, model.spans[i]!, model.law, this.spans[i]!.hinges));
        // Would the ring stand if the stone could not crush? Then crushing is what fails.
        if (crushingOnly && fails(gsfOf(solveAlpha(model.ws, model.spans[i]!, { mu: model.law.mu, sigma: Infinity })))) crushingOnly = false;
      }
      for (let q = 0; q < this.piers.length; q++) if (failingPiers[q]) first.piers.push(q);
      const cause: CauseId = crushingOnly ? 'crushing' : 'strike';
      const fall = collapseFrom(model, first);
      const collapse: CollapseInfo = { year: level.year, cause, spans: fall.spans, piers: fall.piers };
      result = { stands: false, settle: this.spans.map(() => 0), collapse };
    }
    this.strikeCache = result;
    return result;
  }
}

/* -- cache ----------------------------------------------------------------------------------- */

const CACHE_SIZE = 8;
const cache = new WeakMap<LevelDef, { key: string; analysis: Analysis }[]>();

/** The analysis of a normalized design, from a small most-recently-used cache per level. */
export function analysisOf(level: LevelDef, normalized: BridgeDesign): Analysis {
  let list = cache.get(level);
  if (!list) {
    list = [];
    cache.set(level, list);
  }
  const key = JSON.stringify(normalized);
  for (let i = 0; i < list.length; i++) {
    const entry = list[i]!;
    if (entry.key === key) {
      if (i > 0) {
        list.splice(i, 1);
        list.unshift(entry);
      }
      return entry.analysis;
    }
  }
  const analysis = new Analysis(level, normalized);
  list.unshift({ key, analysis });
  if (list.length > CACHE_SIZE) list.length = CACHE_SIZE;
  return analysis;
}
