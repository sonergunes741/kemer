/**
 * What one flood does to the bridge (SIM-SPEC section 9): scour and undermining of the piers,
 * mortar washed from the joints, the push on the masonry face, and the buoyant check.
 */
import type { BridgeDesign, BridgeState, CauseId } from '../core/types';
import type { BridgeModel } from './bridge';
import { completeMechanism } from './mechanism';
import type { Mechanism } from './transient';
import { gsfOf, solveAlpha } from './ring';
import { hingesOf } from './rows';
import {
  DECISION_TOL,
  FLOOD_CHECK_T,
  FLOOD_MORTAR_LOSS,
  FLOOD_PROCESS_T,
  FLOOD_REPORT_T,
  MOVE_EPS,
  PILES_DEPTH,
  UNDERMINE_SETTLE_FROM,
  UNDERMINE_SETTLE_SHARE,
  WASH_BOND,
  WASH_BOND_FADE,
  WASH_CD,
  WATER_UNIT_WEIGHT,
} from './tuning';
import type { FloodState, Waterway } from './water';

export interface FloodOutcome {
  /** Water level upstream of the bridge and velocity through the openings. */
  level: number;
  velocity: number;
  overtopped: boolean;
  /** Smallest margin seen at the peak (buoyant gsf, wash-out), Infinity when nothing was checked. */
  safety: number;
  /** A pier settled further: the spans beside it have moved supports. */
  settled: boolean;
  /** Worth an event. */
  report: boolean;
  /** Present when the flood itself brings something down. */
  mechanism: Mechanism | null;
  cause: CauseId;
}

export class FloodDesk {
  private readonly water: Waterway;
  private readonly model: BridgeModel;
  private readonly flood: FloodState = { stage: 0, level: 0, velocity: 0, overtopped: false };
  private readonly outcome: FloodOutcome = { level: 0, velocity: 0, overtopped: false, safety: Infinity, settled: false, report: false, mechanism: null, cause: 'flood-wash' };

  constructor(water: Waterway, model: BridgeModel) {
    this.water = water;
    this.model = model;
  }

  /**
   * Apply a flood of natural stage `stage` to the state. Returns null for floods too small to
   * matter. The returned object is reused between calls.
   */
  process(stage: number, debris: number, period: number, named: boolean, state: BridgeState, design: BridgeDesign): FloodOutcome | null {
    if (!named && period < FLOOD_PROCESS_T) return null;
    const { water, model } = this;
    const layout = model.layout;
    const flood = water.flood(stage, debris, this.flood);
    const out = this.outcome;
    out.level = flood.level;
    out.velocity = flood.velocity;
    out.overtopped = flood.overtopped;
    out.safety = Infinity;
    out.settled = false;
    out.report = named || period >= FLOOD_REPORT_T;
    out.mechanism = null;
    out.cause = 'flood-wash';

    // Scour: the deepest hole so far counts; riprap from repairs fills part of it.
    const depth = design.foundation + (design.piles ? PILES_DEPTH : 0);
    for (let q = 0; q < state.piers.length; q++) {
      const pier = state.piers[q]!;
      if (!pier.alive) continue;
      pier.scour = Math.max(pier.scour, water.scour(q, flood, debris));
      const ratio = (pier.scour - pier.protection) / Math.max(0.1, depth);
      if (ratio > 1 + DECISION_TOL) {
        out.mechanism ??= { spans: new Map(), piers: [] };
        out.mechanism.piers.push(q);
        out.cause = 'flood-scour';
        out.safety = Math.min(out.safety, 1 / ratio);
      } else if (ratio > UNDERMINE_SETTLE_FROM) {
        const settle = (UNDERMINE_SETTLE_SHARE * layout.piers[q]!.width * (ratio - UNDERMINE_SETTLE_FROM)) / (1 - UNDERMINE_SETTLE_FROM);
        if (settle > pier.settlement + MOVE_EPS) {
          pier.settlement = settle;
          out.settled = true;
        }
      }
    }

    // Mortar washed out of every joint the water wets.
    for (let i = 0; i < model.count; i++) {
      const a = layout.shapes[i]!;
      const wet = Math.min(1, Math.max(0, (flood.level - a.ys) / (a.rise + a.t)));
      if (state.spans[i]!.alive) state.spans[i]!.jointLoss += FLOOD_MORTAR_LOSS * wet;
    }
    if (out.mechanism) return out;

    // The push on the masonry and the buoyant check only matter once the water is on the rings.
    let lowest = Infinity;
    for (const a of layout.shapes) lowest = Math.min(lowest, a.ys);
    if (flood.level <= lowest) return out;
    const pressure = 0.5 * WASH_CD * flood.velocity * flood.velocity + WATER_UNIT_WEIGHT * Math.max(0, flood.level - stage);
    let pushed = false;
    for (let i = 0; i < model.count; i++) {
      const dry = model.spans[i]!.dryWeight() * layout.width * layout.stone.friction;
      // Buoyant weight is at least 0.3 of dry weight for any stone here: a cheap screen.
      if (pressure * water.faceArea(i, flood.level) > 0.3 * dry) pushed = true;
    }
    if (!pushed && !named && period < FLOOD_CHECK_T) return out;

    for (let i = 0; i < model.count; i++) model.spans[i]!.loss = state.spans[i]!.jointLoss;
    model.setWater(flood.level);
    for (let i = 0; i < model.count; i++) {
      const sp = model.spans[i]!;
      const a = layout.shapes[i]!;
      // Swept away? Friction under the buoyant weight plus what bond the springing joints have left.
      let weight = 0;
      for (let k = 0; k < sp.n; k++) weight += (sp.selfW[k] as number) + (sp.fillW[k] as number);
      const loss = state.spans[i]!.jointLoss;
      const bond = WASH_BOND * Math.max(0, 1 - loss / (WASH_BOND_FADE * a.t)) * (design.clamps ? 2 : 1);
      const hold = layout.stone.friction * weight * layout.width + bond * 2 * Math.max(0, a.t - loss) * layout.width;
      const push = pressure * water.faceArea(i, flood.level);
      const margin = push > 0 ? hold / push : Infinity;
      if (margin < 1 - DECISION_TOL) {
        out.mechanism ??= { spans: new Map(), piers: [] };
        out.mechanism.spans.set(i, []);
      }
      // Lighter stone, same shape: does a line of thrust still fit?
      const alpha = solveAlpha(model.ws, sp, model.law);
      const gsf = gsfOf(alpha);
      if (gsf < 1 - DECISION_TOL && !out.mechanism?.spans.has(i)) {
        out.mechanism ??= { spans: new Map(), piers: [] };
        const touching = alpha === Infinity ? [] : hingesOf(sp, sp.sol[0] as number, sp.sol[1] as number, sp.sol[2] as number, 0, alpha, model.law);
        out.mechanism.spans.set(i, completeMechanism(model.ws, sp, model.law, touching));
      }
      out.safety = Math.min(out.safety, margin, gsf);
    }
    model.setWater(0);
    return out;
  }
}
