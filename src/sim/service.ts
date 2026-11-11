/**
 * The bridge in service (SIM-SPEC section 10): the margin the gauge shows during the centuries and
 * what a repair costs.
 *
 * The service safety is the smallest margin against whatever will bring the bridge down next under
 * ordinary conditions, a few years ahead (FORESIGHT): the rings on their moved supports and the
 * piers under their own weight (Condition.foresee), the ordinary axle of the era now or soon
 * against the axle capacity, and scour at the pier feet against the foundation. A repair is priced
 * by the work it does: the joint depth restored on the faces that have joints, and riprap where a
 * pier foot gets more of it.
 */
import type { BridgeState, LevelDef, TrafficEra } from '../core/types';
import type { Analysis } from './analysis';
import type { Condition, Weakness } from './condition';
import type { Layout } from './geometry';
import { ringArea, spandrelArea } from './geometry';
import {
  BLOCK_DEPTH,
  FLOOD_UPCOMING_T,
  FORESIGHT,
  GSF_CAP,
  PILES_DEPTH,
  REPAIR_JOINT_STONES,
  REPAIR_LOSS_LEFT,
  REPAIR_MIN_STONES,
  REPAIR_PROTECTION,
  REPAIR_PROTECTION_CAP,
  REPAIR_RIPRAP_STONES,
  SPANDREL_THICKNESS,
  TRAFFIC_LOOKAHEAD,
  WATCH_SAFETY,
} from './tuning';
import { floodStage } from './water';

/**
 * The heaviest ordinary axle of the eras running at `year` or beginning within the lookahead: the
 * carts a bridge must be ready for, so a heavier era is announced before it arrives.
 */
export function axleAhead(traffic: readonly TrafficEra[], year: number): number {
  let axle = 0;
  let last: TrafficEra | null = null;
  for (const era of traffic) {
    if (era.from <= year) last = era;
    if (era.to > year && era.from <= year + TRAFFIC_LOOKAHEAD) axle = Math.max(axle, era.axle);
  }
  // Past the last era the last one goes on (Run.eraOf does the same).
  return axle > 0 ? axle : (last?.axle ?? 0);
}

/**
 * Keeps the service safety of one run: what the joints will have lost FORESIGHT years on, the
 * scour an ordinary flood digs, and the margins put together on the state.
 */
export class Service {
  // Plain fields, not parameter properties: the balance script runs under Node's type stripping.
  private readonly level: LevelDef;
  readonly bill: RepairBill;
  /** Joint loss each span is foreseen to gain (metres), filled by ahead(). */
  private readonly gain: Float64Array;
  /** Joint loss of each span just after the last repair (0 when built). */
  private readonly base: Float64Array;
  private since: number;
  /** Effective foundation depth of every pier against undermining, metres (SIM-SPEC 9). */
  private readonly depth: number;
  /** Scour the river's ordinary flood digs at each pier: the largest it does not announce (upcoming()). */
  private readonly ordinary: number[];

  constructor(level: LevelDef, analysis: Analysis) {
    this.level = level;
    const count = analysis.layout.shapes.length;
    this.bill = new RepairBill(analysis.layout);
    this.gain = new Float64Array(count);
    this.base = new Float64Array(count);
    this.since = level.year;
    this.depth = Math.max(0.1, analysis.design.foundation + (analysis.design.piles ? PILES_DEPTH : 0));
    const water = analysis.waterway();
    const flood = water.flood(floodStage(level, FLOOD_UPCOMING_T), 0, { stage: 0, level: 0, velocity: 0, overtopped: false });
    this.ordinary = analysis.layout.piers.map((_, q) => water.scour(q, flood, 0));
  }

  /**
   * Joint loss each span will have gained FORESIGHT years on: at the weathering rate of the year
   * (`rate`, m/year), or at the rate it has really been losing since the last repair when that is
   * faster (floods wash mortar out, earthquakes shake it loose).
   */
  ahead(year: number, rate: number, state: BridgeState): Float64Array {
    const years = Math.max(1, year - this.since);
    for (let i = 0; i < this.gain.length; i++) {
      const seen = ((state.spans[i]?.jointLoss ?? 0) - (this.base[i] as number)) / years;
      this.gain[i] = FORESIGHT * Math.max(rate, seen);
    }
    return this.gain;
  }

  /** A repair at `year`: the losses it left are where the next count starts. */
  repaired(year: number, state: BridgeState): void {
    this.since = year;
    for (let i = 0; i < this.base.length; i++) this.base[i] = state.spans[i]?.jointLoss ?? 0;
  }

  /** The foreseen axle capacity over the ordinary axle of the era now or soon. */
  traffic(condition: Condition, year: number): number {
    const axle = axleAhead(this.level.traffic, year);
    return axle > 0 ? condition.axleAhead / axle : Infinity;
  }

  /**
   * The pier foot closest to being undermined: foundation depth over the scour beyond protection.
   * The scour is the deepest hole so far or the one the ordinary flood would dig, whichever is
   * deeper: a foundation an ordinary flood would undermine is in danger before that flood comes.
   */
  scour(state: BridgeState): number {
    let margin = Infinity;
    for (let q = 0; q < state.piers.length; q++) {
      const pier = state.piers[q]!;
      if (!pier.alive) continue;
      const open = Math.max(pier.scour, this.ordinary[q] ?? 0) - pier.protection;
      if (open > 0) margin = Math.min(margin, this.depth / open);
    }
    return margin;
  }

  /** The part that wears by the year and earns yearly checks below WATCH_SAFETY: the rings, the traffic. */
  watched(condition: Condition, year: number): boolean {
    return Math.min(condition.rings, this.traffic(condition, year)) < WATCH_SAFETY;
  }

  /** Put the service safety and what governs it on the state. */
  serve(state: BridgeState, condition: Condition, year: number): void {
    let safety = Math.min(GSF_CAP, condition.safety);
    let weakness: Weakness = condition.weakness;
    const traffic = this.traffic(condition, year);
    if (traffic < safety) {
      safety = traffic;
      weakness = 'traffic';
    }
    const scour = this.scour(state);
    if (scour < safety) {
      safety = scour;
      weakness = 'scour';
    }
    state.safety = safety;
    state.weakness = safety < WATCH_SAFETY ? weakness : 'none';
  }
}

/** Prices repairs: the dressed stones that carry joints, span by span, as counted in geometry. */
export class RepairBill {
  /** Ring and spandrel-wall stones of each span. */
  private readonly jointed: number[];
  private readonly widths: number[];

  constructor(layout: Layout) {
    const block = Math.max(1e-3, layout.stone.blockLength * layout.stone.blockHeight * BLOCK_DEPTH);
    this.jointed = layout.shapes.map((a) => (ringArea(a) * layout.width + Math.max(0, spandrelArea(layout, a)) * 2 * SPANDREL_THICKNESS) / block);
    this.widths = layout.piers.map((p) => p.width);
  }

  /** Protection a repair adds at pier q (metres), never past the cap. */
  protectionAdded(state: BridgeState, q: number): number {
    const pier = state.piers[q]!;
    const w = this.widths[q] ?? 0;
    if (!pier.alive) return 0;
    return Math.max(0, Math.min(REPAIR_PROTECTION_CAP * w, pier.protection + REPAIR_PROTECTION * w) - pier.protection);
  }

  /** Stones of a repair now: repointing what weathering took, riprap where it is added, a minimum. */
  stones(state: BridgeState): number {
    let joints = 0;
    for (let i = 0; i < state.spans.length; i++) {
      const s = state.spans[i]!;
      if (!s.alive) continue;
      const restored = (1 - REPAIR_LOSS_LEFT) * s.jointLoss;
      joints += (this.jointed[i] ?? 0) * Math.min(1, restored / BLOCK_DEPTH);
    }
    let riprap = 0;
    for (let q = 0; q < state.piers.length; q++) {
      const w = this.widths[q] ?? 0;
      if (w > 0) riprap += (REPAIR_RIPRAP_STONES * this.protectionAdded(state, q)) / (REPAIR_PROTECTION * w);
    }
    return Math.max(REPAIR_MIN_STONES, Math.ceil(REPAIR_JOINT_STONES * joints + riprap));
  }
}
