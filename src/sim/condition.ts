/**
 * The structural condition of an ageing bridge (SIM-SPEC sections 8 and 6 as used by section 10):
 * where every support has moved to, the shape each span has taken, its margin there, and the
 * piers. The chronicle decides when to look; this decides what it sees, now and as the joints will
 * be a few years on (the forecast the gauge shows).
 */
import type { BridgeState, CauseId, ChronicleEvent } from '../core/types';
import type { Analysis, SpanDead } from './analysis';
import { analyseDead, fails } from './analysis';
import { BridgeModel } from './bridge';
import { SOILS } from './materials';
import { completeMechanism } from './mechanism';
import type { HingeSet } from './movement';
import { hingeList, shiftsOf, solveMovement } from './movement';
import { gsfOf, solveAlpha, solveThrust } from './ring';
import { pierStabilities } from './stability';
import type { Mechanism } from './transient';
import { axleCapacityAt } from './transient';
import { CRACK_MOVE, DECISION_TOL, MOVE_EPS, WEAR_SPREAD, YIELD_PILES, YIELD_TAU } from './tuning';

export interface Failure {
  readonly mechanism: Mechanism;
  readonly cause: CauseId;
}

/** What wears a bridge down, as BridgeState.weakness names it. */
export type Weakness = NonNullable<BridgeState['weakness']>;

/** The worst place for an axle on a span and the axle's footprint there (Analysis.spots()). */
export interface AxleSpot {
  readonly x: number;
  readonly length: number;
  readonly width: number;
}

export class Condition {
  /** The run's own model: it changes as the bridge ages. */
  readonly model: BridgeModel;
  /**
   * Smallest dead-load margin as last foreseen: the rings on their moved supports with the joints
   * as they will be (foresee), the piers as they are.
   */
  safety = Infinity;
  /** The rings' part of it alone: what weathering wears down year by year. */
  rings = Infinity;
  /** What `safety` is short of: wasted joints, scour that dropped a pier, or ground that moved. */
  weakness: Weakness = 'joints';
  /** Axle capacity (kN) with the joints as they will be, at the last foresee() that measured it. */
  axleAhead = Infinity;
  private readonly builtYear: number;
  /** The hinges each span has open, kept from look to look (solveMovement). */
  private readonly sets: (HingeSet | null)[];
  /** Ring margins with the joints as they will be (foresee). */
  private readonly future: Float64Array;
  /** Abutment yielding at infinite time, left and right, metres. */
  private readonly yieldInf: readonly [number, number];
  /** Permanent opening of each span left by earthquakes and overloads, metres. */
  private readonly opened: Float64Array;
  /** The part of it left by everyday traffic that was too heavy for the bridge even when new. */
  private readonly openedByTraffic: Float64Array;
  /** What the ground itself has done to each span at the last check: abutment yielding, metres apart. */
  private readonly ground: Float64Array;
  private readonly lastU: Float64Array;
  private readonly lastV: Float64Array;
  private readonly cracked: Set<number>[];
  private readonly stability: number[] = [];
  private readonly dead: SpanDead[] = [];
  /** Scratch of movementOf: apart, down, and the part of `apart` that is yielding ground. */
  private readonly move: [number, number, number] = [0, 0, 0];

  constructor(analysis: Analysis) {
    this.model = new BridgeModel(analysis.layout);
    this.builtYear = analysis.level.year;
    const count = this.model.count;
    this.opened = new Float64Array(count);
    this.openedByTraffic = new Float64Array(count);
    this.ground = new Float64Array(count);
    this.lastU = new Float64Array(count);
    this.lastV = new Float64Array(count);
    this.cracked = Array.from({ length: count }, () => new Set<number>());
    this.sets = Array.from({ length: count }, () => null);
    this.future = new Float64Array(count).fill(Infinity);
    for (const s of analysis.piers) this.stability.push(s);
    // Soft ground lets an abutment creep outward under the thrust it has to hold.
    const piles = analysis.design.piles ? YIELD_PILES : 1;
    const abutments = analysis.layout.abutments;
    this.yieldInf = [
      SOILS[abutments[0].soil].yielding * Math.max(0, analysis.spans[0]!.thrust) * piles,
      SOILS[abutments[1].soil].yielding * Math.max(0, analysis.spans[count - 1]!.thrust) * piles,
    ];
  }

  /**
   * Open span i for good by `amount` metres (earthquake, overload). `traffic` marks the everyday
   * axle of an era that the bridge was never strong enough for: that damage is the load's doing.
   */
  open(i: number, amount: number, traffic = false): void {
    this.opened[i] = (this.opened[i] as number) + amount;
    if (traffic) this.openedByTraffic[i] = (this.openedByTraffic[i] as number) + amount;
  }

  /** Movement of span i's right support relative to its left one at `year`: [apart, down]. */
  private movementOf(i: number, year: number, state: BridgeState): void {
    const settled = 1 - Math.exp(-(year - this.builtYear) / YIELD_TAU);
    const count = this.model.count;
    let yielded = 0;
    if (i === 0) yielded += this.yieldInf[0] * settled;
    if (i === count - 1) yielded += this.yieldInf[1] * settled;
    const right = i < count - 1 ? state.piers[i]!.settlement : 0;
    const left = i > 0 ? state.piers[i - 1]!.settlement : 0;
    this.move[0] = (this.opened[i] as number) + yielded;
    this.move[1] = right - left;
    this.move[2] = yielded;
  }

  /**
   * Why a span fails that would stand with its supports where they were built. The ground is only
   * to blame when the ground moved: yielding banks (`settlement`) or a scoured pier
   * (`flood-scour`). The openings earthquakes and overloads leave are damage, not soft ground: a
   * ring that fails on those is worn out (`weathering`), or was never fit for its traffic (`load`).
   * Leaves the span in some other shape: the caller puts it back.
   */
  private blame(i: number, u: number, v: number, yielded: number): CauseId {
    const { ws, law } = this.model;
    const sp = this.model.spans[i]!;
    const opened = u - yielded;
    const groundMoved = Math.abs(yielded) > MOVE_EPS || Math.abs(v) > MOVE_EPS;
    let ground = groundMoved;
    if (groundMoved && opened > MOVE_EPS) {
      // Both: whichever brings the ring down by itself, the ground first; failing that, the larger.
      const falls = (du: number, dv: number): boolean => fails(gsfOf(solveMovement(ws, sp, law, du, dv, true).alpha));
      if (!falls(yielded, v)) ground = !falls(opened, 0) && Math.abs(yielded) + Math.abs(v) >= opened;
    }
    if (ground) return Math.abs(v) > MOVE_EPS ? 'flood-scour' : 'settlement';
    return (this.openedByTraffic[i] as number) > 0.5 * opened ? 'load' : 'weathering';
  }

  /**
   * What holds a span's margin down, cheaply: a pier that scour has let drop, banks that have
   * yielded, or (failing a movement worth the name) its own wasted joints. Earthquake and overload
   * openings count as wear, as in blame().
   */
  private spanWeakness(i: number, state: BridgeState): Weakness {
    const worth = WEAR_SPREAD * this.model.spans[i]!.shape.span;
    if (Math.abs(state.spans[i]!.drop) > worth) return 'scour';
    return Math.abs(this.ground[i] as number) > worth ? 'ground' : 'joints';
  }

  /** A pier at its limit stands on ground that gives (or on a hole scour has dug). */
  private pierWeakness(q: number, state: BridgeState): Weakness {
    const near = [state.spans[q], state.spans[q + 1]];
    return near.some((s) => s && Math.abs(s.drop) > MOVE_EPS) ? 'scour' : 'ground';
  }

  /** Record the smallest of the foreseen ring margins and the pier margins, and what it is short of. */
  private settle(state: BridgeState): void {
    let safety = Infinity;
    let weakness: Weakness = 'joints';
    for (let i = 0; i < state.spans.length; i++) {
      const gsf = this.future[i] as number;
      if (gsf < safety) {
        safety = gsf;
        weakness = this.spanWeakness(i, state);
      }
    }
    this.rings = safety;
    for (let q = 0; q < this.stability.length; q++) {
      const margin = this.stability[q] as number;
      if (margin < safety) {
        safety = margin;
        weakness = this.pierWeakness(q, state);
      }
    }
    this.safety = safety;
    this.weakness = weakness;
  }

  /**
   * The margins as the joints will be: every ring on the shape it has now with `ahead[i]` more
   * joint loss, and (given the axle spots) the axle capacity too. The piers keep their present
   * margin: they change when the ground moves, and every flood that moves it is looked at at once.
   * The model is put back as it is now.
   */
  foresee(state: BridgeState, ahead: ArrayLike<number>, spots: readonly AxleSpot[] | null): void {
    const { model } = this;
    for (let i = 0; i < model.count; i++) {
      const sp = model.spans[i]!;
      sp.loss = state.spans[i]!.jointLoss + (ahead[i] as number);
      sp.place();
      sp.refresh();
      this.future[i] = Math.min(state.spans[i]!.gsf, gsfOf(solveAlpha(model.ws, sp, model.law)));
    }
    if (spots) this.axleAhead = this.traffic(spots).capacity;
    for (let i = 0; i < model.count; i++) {
      const sp = model.spans[i]!;
      sp.loss = state.spans[i]!.jointLoss;
      sp.place();
      sp.refresh();
    }
    this.settle(state);
  }

  /** Axle capacity (kN) at every span's worst spot, on the model as it stands: the smallest, and its span. */
  traffic(spots: readonly AxleSpot[]): { capacity: number; weakest: number } {
    const { model } = this;
    let capacity = Infinity;
    let weakest = 0;
    for (let i = 0; i < model.count; i++) {
      const spot = spots[i]!;
      const c = axleCapacityAt(model, i, spot.x, spot.length, spot.width);
      if (c < capacity) {
        capacity = c;
        weakest = i;
      }
    }
    return { capacity, weakest };
  }

  /**
   * The structural check: put every span in the shape its supports force on it, measure gsf
   * there, then the piers. Updates the spans and the piers' margins, reports new cracks, and
   * returns what fails, if anything, with its cause: wasted joints alone are `weathering`, ground
   * that moved the supports `settlement` (`flood-scour` when a scoured pier dropped them); see
   * blame(). The margins the gauge shows follow from foresee().
   */
  check(year: number, state: BridgeState, events: ChronicleEvent[]): Failure | null {
    const { model } = this;
    const { ws, law } = model;
    const mechanism: Mechanism = { spans: new Map(), piers: [] };
    let cause: CauseId = 'weathering';
    let yielding = false;
    let dropped = false;
    this.stability.length = 0;
    for (let i = 0; i < model.count; i++) {
      const sp = model.spans[i]!;
      const s = state.spans[i]!;
      this.movementOf(i, year, state);
      const u = this.move[0];
      const v = this.move[1];
      const yielded = this.move[2];
      this.ground[i] = yielded;
      sp.loss = s.jointLoss;
      // The hinges follow the direction of the latest movement.
      const du = u - (this.lastU[i] as number);
      const dv = v - (this.lastV[i] as number);
      const fresh = Math.abs(du) > MOVE_EPS || Math.abs(dv) > MOVE_EPS;
      const result = solveMovement(ws, sp, law, u, v, true, fresh ? du : u, fresh ? dv : v, this.sets[i]);
      this.sets[i] = result.ok ? result.hinges : null;
      this.lastU[i] = u;
      this.lastV[i] = v;
      s.spread = u;
      s.drop = v;
      s.gsf = result.ok ? gsfOf(result.alpha) : Math.min(gsfOf(result.alpha), 1 - 2 * DECISION_TOL);
      shiftsOf(sp, s.shifts);
      s.hinges = Math.abs(u) + Math.abs(v) >= CRACK_MOVE ? hingeList(sp, result.hinges) : [];
      for (const h of s.hinges) {
        if (this.cracked[i]!.has(h.joint)) continue;
        this.cracked[i]!.add(h.joint);
        events.push({ kind: 'crack', year, span: i, hinge: h });
      }
      if (Math.abs(yielded) > MOVE_EPS) yielding = true;
      if (Math.abs(v) > MOVE_EPS) dropped = true;
      if (fails(s.gsf)) {
        const open = hingeList(sp, result.hinges);
        // Wasted joints alone, or the supports? Ask the same ring with its supports where they were built.
        const alone = fails(gsfOf(solveMovement(ws, sp, law, 0, 0, true).alpha));
        if (!alone) cause = this.blame(i, u, v, yielded);
        solveMovement(ws, sp, law, u, v, false, fresh ? du : u, fresh ? dv : v, result.hinges);
        // The three hinges of the movement are open already; the fourth is where the ring now gives.
        mechanism.spans.set(i, completeMechanism(ws, sp, law, open));
      }
      solveThrust(ws, sp, law, 1, 1);
    }
    if (mechanism.spans.size === 0) {
      pierStabilities(model, this.stability);
      for (let q = 0; q < this.stability.length; q++) {
        if (fails(this.stability[q] as number)) {
          mechanism.piers.push(q);
          // A pier pushed over by spans the ground has moved; otherwise it is the wasted joints.
          if (dropped) cause = 'flood-scour';
          else if (yielding) cause = 'settlement';
        }
      }
    }
    return mechanism.spans.size > 0 || mechanism.piers.length > 0 ? { mechanism, cause } : null;
  }

  /**
   * What has worn the bridge down most: ground that moved the supports (scour or yielding banks,
   * as of the last check) or wasted joints. Openings left by earthquakes and loads count as wear.
   */
  wearCause(state: BridgeState): CauseId {
    let moved = false;
    let dropped = false;
    for (let i = 0; i < this.model.count; i++) {
      if (Math.abs(state.spans[i]!.drop) > MOVE_EPS) dropped = true;
      if (Math.abs(this.ground[i] as number) > WEAR_SPREAD * this.model.spans[i]!.shape.span) moved = true;
    }
    return dropped ? 'flood-scour' : moved ? 'settlement' : 'weathering';
  }

  /** After a repair: margins for the repointed joints, nothing moved (foresee() follows). */
  refresh(state: BridgeState): void {
    const { model } = this;
    for (let i = 0; i < model.count; i++) {
      const sp = model.spans[i]!;
      sp.loss = state.spans[i]!.jointLoss;
      sp.place();
      sp.refresh();
    }
    analyseDead(model, this.dead, this.stability);
    for (let i = 0; i < model.count; i++) state.spans[i]!.gsf = this.dead[i]!.gsf;
  }
}
