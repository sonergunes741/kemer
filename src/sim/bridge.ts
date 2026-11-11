/**
 * The whole bridge (SIM-SPEC section 6): rings coupled through their piers in one LP.
 *
 * A pier receives the end force of the span on its left, minus the support reaction of the span
 * on its right, plus its own weight and the fill over it. Its base joint may not go into tension
 * (overturning), slide, or exceed the soil's bearing pressure. Coupled problems are solved over a
 * window of neighbouring spans: a pier only feels its own two spans and, through them, the piers
 * next door, and small windows keep the every-pointer-move path fast.
 */
import type { Layout } from './geometry';
import { deckAt, pierFillRange } from './geometry';
import { buildSpanModel, setBuoyancy } from './loads';
import type { LpStatus } from './lp';
import { SOILS } from './materials';
import { Workspace } from './ring';
import type { JointLaw, SpanModel } from './span';
import { lazyScan, writeLazyRow, writeNoTension } from './rows';
import { CLAMP_ALPHA, CLAMP_FRICTION, CRUSH_TANGENTS, FOOTING_EXTRA, PILES_BEARING, THRUST_CAP, WATER_UNIT_WEIGHT } from './tuning';

/** Tiny pull towards low thrust in coupled problems: breaks ties the way real supports do. */
const THRUST_BIAS = 1e-6;
/** `soft` value meaning every pier in the window shares the slack. */
export const ALL_PIERS = -2;

export class BridgeModel {
  readonly layout: Layout;
  readonly spans: SpanModel[];
  readonly count: number;
  readonly ws = new Workspace();
  /** Force and length scales shared by every span, so pier rows can mix them. */
  readonly W: number;
  readonly L: number;
  /** Joint law under dead load, and under transient loads (clamps help only there). */
  readonly law: JointLaw;
  readonly transientLaw: JointLaw;
  readonly transientAlpha: number;

  /* Piers: dry and effective own weight, fill and deck above (weight, lever arm, height). */
  readonly pierSelf0: Float64Array;
  readonly pierSelf: Float64Array;
  readonly pierFill: Float64Array;
  readonly pierFillX: Float64Array;
  readonly pierFillY: Float64Array;
  /** Footing width, ultimate bearing pressure and base friction. */
  readonly footing: Float64Array;
  readonly bearing: Float64Array;
  readonly baseMu: Float64Array;

  /* Current assembly. Read by stability.ts and transient.ts; nothing outside the sim touches these. */
  readonly col: Int32Array;
  readonly row: Int32Array;
  from = 0;
  to = 0;
  lamCol = -1;
  sCol = -1;
  alpha = 1;
  assemblyLaw: JointLaw;
  private readonly basis = new Int32Array(64);
  private readonly form = new Float64Array(24);
  readonly state = new Float64Array(3);
  /** Span states (X, Y, m per span) of the best answer of the last kappaSearch. */
  readonly found: Float64Array;

  constructor(layout: Layout, selfOnly = false) {
    this.layout = layout;
    const count = layout.shapes.length;
    this.count = count;
    let L = 0;
    for (const a of layout.shapes) L = Math.max(L, a.span);
    this.L = L;
    this.spans = [];
    let W = 1e-6;
    for (let i = 0; i < count; i++) {
      const sp = buildSpanModel(layout, i, L, selfOnly);
      this.spans.push(sp);
      W = Math.max(W, sp.dryWeight());
    }
    this.W = W;
    const stone = layout.stone;
    this.law = { mu: stone.friction, sigma: stone.strength };
    const clamps = layout.design.clamps;
    this.transientLaw = { mu: stone.friction * (clamps ? CLAMP_FRICTION : 1), sigma: stone.strength };
    this.transientAlpha = clamps ? CLAMP_ALPHA : 1;
    this.assemblyLaw = this.law;

    const piers = layout.piers;
    const np = piers.length;
    this.pierSelf0 = new Float64Array(np);
    this.pierSelf = new Float64Array(np);
    this.pierFill = new Float64Array(np);
    this.pierFillX = new Float64Array(np);
    this.pierFillY = new Float64Array(np);
    this.footing = new Float64Array(np);
    this.bearing = new Float64Array(np);
    this.baseMu = new Float64Array(np);
    for (let i = 0; i < np; i++) {
      const p = piers[i]!;
      const soil = SOILS[p.soil];
      this.pierSelf0[i] = stone.unitWeight * p.width * (p.top - p.base);
      this.footing[i] = p.width + 2 * FOOTING_EXTRA;
      this.bearing[i] = soil.bearing * (layout.design.piles ? PILES_BEARING : 1);
      this.baseMu[i] = soil.friction;
      if (!selfOnly) {
        const [a, b] = pierFillRange(layout, i);
        const height = Math.max(0, deckAt(layout.deck, p.x) - p.top);
        let area = (b - a) * height;
        const slot = layout.reliefOf[i]!;
        if (slot >= 0) area = Math.max(0, area - layout.reliefs[slot]!.width * layout.reliefs[slot]!.height);
        this.pierFill[i] = layout.fillWeight * area + layout.deckLoad * (b - a);
        this.pierFillX[i] = (a + b) / 2;
        this.pierFillY[i] = p.top + height / 2;
      } else {
        this.pierFillX[i] = p.x;
        this.pierFillY[i] = p.top;
      }
    }
    this.col = new Int32Array(count);
    this.found = new Float64Array(3 * count);
    this.row = new Int32Array(count);
    for (const sp of this.spans) sp.W = W;
    this.setWater(0);
  }

  /** Water level for buoyancy: everything below it weighs 9.81 kN/m3 less. Rebuilds the joint forms. */
  setWater(level: number): void {
    const piers = this.layout.piers;
    for (let i = 0; i < piers.length; i++) {
      const p = piers[i]!;
      const wet = Math.max(0, Math.min(level, p.top) - p.base);
      this.pierSelf[i] = (this.pierSelf0[i] as number) - WATER_UNIT_WEIGHT * p.width * wet;
    }
    for (const sp of this.spans) {
      setBuoyancy(sp, level);
      sp.place();
      sp.refresh();
    }
  }

  /* -- pier rows ---------------------------------------------------------------------------- */

  /**
   * Linear forms of the base joint of pier q: N (down), V and M about the base centre, each over
   * [X_L, Y_L, m_L, X_R, Y_R, m_R, constant, lambda], scaled like the span forms. `left`/`right`
   * say which neighbours still stand. `dir` is the earthquake direction (0 without one).
   */
  private pierForm(q: number, left: boolean, right: boolean, dir: number): void {
    const f = this.form;
    f.fill(0);
    const p = this.layout.piers[q]!;
    const W = this.W;
    const L = this.L;
    const self = (this.pierSelf[q] as number) / W;
    const fill = (this.pierFill[q] as number) / W;
    // Own loads: vertical weights, and their inertia in an earthquake.
    f[6] = self + fill;
    f[8 + 7] = dir * (self + fill);
    f[16 + 6] = (-((this.pierFillX[q] as number) - p.x) * fill) / L;
    f[16 + 7] = (-dir * (((p.top + p.base) / 2 - p.base) * self + ((this.pierFillY[q] as number) - p.base) * fill)) / L;
    if (left) {
      const sp = this.spans[q]!;
      const bx = (p.x - sp.ox) / L;
      const by = (p.base - sp.oy) / L;
      f[1] = -1;
      f[6] = (f[6] as number) - sp.endFy;
      f[7] = -sp.endLy;
      f[8] = 1;
      f[8 + 7] = (f[8 + 7] as number) + sp.endLx;
      f[16] = by;
      f[16 + 1] = -bx;
      f[16 + 2] = 1;
      f[16 + 6] = (f[16 + 6] as number) + sp.endG - bx * sp.endFy;
      f[16 + 7] = (f[16 + 7] as number) + sp.endLg - bx * sp.endLy + by * sp.endLx;
    }
    if (right) {
      const sp = this.spans[q + 1]!;
      const bx = (p.x - sp.ox) / L;
      const by = (p.base - sp.oy) / L;
      f[4] = 1;
      f[8 + 3] = -1;
      f[16 + 3] = -by;
      f[16 + 4] = bx;
      f[16 + 5] = -1;
    }
  }

  /** Write one row sum_k coef[k] x_k <= rhs from a combination of the pier forms. */
  private pierRow(colL: number, colR: number, aN: number, aV: number, aM: number, slack: number, rhs: number): void {
    const f = this.form;
    const p = this.ws.p;
    for (let k = 0; k < 3; k++) {
      if (colL >= 0) {
        const v = aN * (f[k] as number) + aV * (f[8 + k] as number) + aM * (f[16 + k] as number);
        if (v !== 0) p.add(colL + k, v);
      }
      if (colR >= 0) {
        const v = aN * (f[3 + k] as number) + aV * (f[8 + 3 + k] as number) + aM * (f[16 + 3 + k] as number);
        if (v !== 0) p.add(colR + k, v);
      }
    }
    if (this.lamCol >= 0) p.add(this.lamCol, aN * (f[7] as number) + aV * (f[8 + 7] as number) + aM * (f[16 + 7] as number));
    if (slack !== 0) p.add(this.sCol, slack);
    p.end(rhs - (aN * (f[6] as number) + aV * (f[8 + 6] as number) + aM * (f[16 + 6] as number)));
  }

  /**
   * Rows of pier q with its base width and base friction shrunk by 1/kappa: N >= 0,
   * |V| <= kappa mu N, |M| <= kappa (wb/2) N and the bearing tangents
   * |M| <= (wb/2)((kappa - 2u) N + u^2 q wb). The slack sits on every row kappa scales (sliding
   * included): a pier that must slide then shows up as a margin below 1, not as "no answer".
   */
  private writePier(q: number, colL: number, colR: number, kappa: number, slackWeight: number, dir: number): void {
    this.pierForm(q, colL >= 0, colR >= 0, dir);
    const wb = (this.footing[q] as number) / this.L;
    const bearing = ((this.bearing[q] as number) * this.L) / this.W;
    const mu = this.baseMu[q] as number;
    this.pierRow(colL, colR, -1, 0, 0, 0, 0);
    // Sliding slack weight mu N against the tipping weight (wb/2) N: both rows then measure kappa.
    const slideWeight = (slackWeight * 2 * mu) / wb;
    this.pierRow(colL, colR, -kappa * mu, 1, 0, slideWeight, 0);
    this.pierRow(colL, colR, -kappa * mu, -1, 0, slideWeight, 0);
    const half = (kappa * wb) / 2;
    this.pierRow(colL, colR, -half, 0, 1, slackWeight, 0);
    this.pierRow(colL, colR, -half, 0, -1, slackWeight, 0);
    for (const u of CRUSH_TANGENTS) {
      const h = ((kappa - 2 * u) * wb) / 2;
      const rhs = (wb / 2) * u * u * bearing * wb;
      this.pierRow(colL, colR, -h, 0, 1, slackWeight, rhs);
      this.pierRow(colL, colR, -h, 0, -1, slackWeight, rhs);
    }
  }

  /** N, V, M at the base of pier q for the current LP solution (window columns). */
  pierState(q: number, left: boolean, right: boolean, dir: number): Float64Array {
    this.pierForm(q, left, right, dir);
    const f = this.form;
    const x = this.ws.lp.x;
    const colL = left ? (this.col[q] as number) : -1;
    const colR = right ? (this.col[q + 1] as number) : -1;
    const lam = this.lamCol >= 0 ? (x[this.lamCol] as number) : 0;
    for (let r = 0; r < 3; r++) {
      let v = (f[r * 8 + 6] as number) + lam * (f[r * 8 + 7] as number);
      for (let k = 0; k < 3; k++) {
        if (colL >= 0) v += (f[r * 8 + k] as number) * (x[colL + k] as number);
        if (colR >= 0) v += (f[r * 8 + 3 + k] as number) * (x[colR + k] as number);
      }
      this.state[r] = v;
    }
    return this.state;
  }

  /**
   * Smallest kappa at which the pier state in this.state is admissible. Width only (Infinity if
   * the pier slides or lifts), or with `sliding` the factor on width and friction together
   * (Infinity only if it lifts): the margin pierStabilities reports.
   */
  private kappaOfState(q: number, sliding: boolean): number {
    const N = this.state[0] as number;
    const M = Math.abs(this.state[2] as number);
    if (N <= 1e-12) return Infinity;
    const V = Math.abs(this.state[1] as number);
    const mu = this.baseMu[q] as number;
    if (!sliding && V > mu * N + 1e-9) return Infinity;
    const wb = (this.footing[q] as number) / this.L;
    const bearing = ((this.bearing[q] as number) * this.L) / this.W;
    let extra = 0;
    for (const u of CRUSH_TANGENTS) {
      const e = 2 * u - (u * u * bearing * wb) / N;
      if (e > extra) extra = e;
    }
    const tipping = (2 * M) / (wb * N) + extra;
    return sliding ? Math.max(tipping, V / (mu * N)) : tipping;
  }

  /** kappa (width and friction) needed by pier q at the current LP solution. */
  neededKappa(q: number): number {
    this.pierState(q, true, true, 0);
    return this.kappaOfState(q, true);
  }

  /**
   * kappa needed by pier q when its two spans are in the given states (X, Y, m each), dead load:
   * the base width factor alone, or with `sliding` the factor on width and friction together.
   */
  kappaFor(q: number, left: Float64Array, right: Float64Array, sliding = false): number {
    this.pierForm(q, true, true, 0);
    const f = this.form;
    for (let r = 0; r < 3; r++) {
      let v = f[r * 8 + 6] as number;
      for (let k = 0; k < 3; k++) v += (f[r * 8 + k] as number) * (left[k] as number) + (f[r * 8 + 3 + k] as number) * (right[k] as number);
      this.state[r] = v;
    }
    return this.kappaOfState(q, sliding);
  }

  /* -- assembling and solving a window ---------------------------------------------------------- */

  /**
   * Rows for spans from..to and the piers between them. Columns: X, Y, m per span, then lambda
   * (when `lambda`), then a slack (when `soft` names a pier or ALL_PIERS).
   */
  assemble(from: number, to: number, transient: boolean, lambda: boolean, soft: number, kappa: number, weight: number, dir: number, keepHot: boolean): void {
    const p = this.ws.p;
    const spans = to - from + 1;
    let n = 3 * spans;
    this.lamCol = lambda ? n++ : -1;
    this.sCol = soft !== -1 ? n++ : -1;
    this.from = from;
    this.to = to;
    this.alpha = transient ? this.transientAlpha : 1;
    this.assemblyLaw = transient ? this.transientLaw : this.law;
    p.reset(n, keepHot);
    for (let i = from; i <= to; i++) {
      const c = 3 * (i - from);
      this.col[i] = c;
      this.row[i] = p.m;
      writeNoTension(p, this.spans[i]!, c, this.lamCol, -1, this.alpha, null);
    }
    for (let i = from; i <= to; i++) {
      p.add(this.col[i] as number, 1);
      p.end(THRUST_CAP);
    }
    for (let q = from; q < to; q++) {
      const isSoft = soft === ALL_PIERS || soft === q;
      this.writePier(q, this.col[q] as number, this.col[q + 1] as number, isSoft ? kappa : 1, isSoft ? weight : 0, dir);
    }
    // Lazy rows found in an earlier round of the same search stay in (same order, same row numbers).
    if (keepHot) this.writeLazyRows(0);
    else this.ws.lazyCount = 0;
  }

  /** Write the lazy rows listed in ws.lazy from position `first` on (entries are span << 16 | code). */
  private writeLazyRows(first: number): void {
    const ws = this.ws;
    for (let k = first; k < ws.lazyCount; k++) {
      const entry = ws.lazy[k] as number;
      const i = entry >> 16;
      writeLazyRow(ws.p, this.spans[i]!, this.col[i] as number, this.lamCol, -1, this.alpha, this.assemblyLaw, null, entry & 0xffff);
    }
  }

  /** Solve the assembled window, bringing in friction and crushing rows of any span that needs them. */
  solveWindow(objective: 'slack' | 'lambda' | 'thrust', start: 'cold' | 'crash' | 'warm'): LpStatus {
    const { p, lp, c } = this.ws;
    c.fill(0, 0, p.n);
    for (let i = this.from; i <= this.to; i++) c[this.col[i] as number] = -(objective === 'thrust' ? 1 : THRUST_BIAS);
    if (objective === 'slack') c[this.sCol] = 1;
    if (objective === 'lambda') c[this.lamCol] = 1;

    let basis: Int32Array | null = null;
    if (start === 'crash') {
      // Every span at its own minimum thrust: optimal for the thrust bias, so a valid start.
      basis = this.basis;
      let k = 0;
      for (let i = this.from; i <= this.to && basis; i++) {
        const tb = this.spans[i]!.thrustBasis;
        if ((tb[0] as number) < 0) basis = null;
        else for (let j = 0; j < 3; j++) basis[k++] = (this.row[i] as number) + (tb[j] as number);
      }
      if (basis) {
        if (this.lamCol >= 0) basis[k++] = -(2 * this.lamCol + 1);
        if (this.sCol >= 0) basis[k++] = -(2 * this.sCol + 1);
      }
    }
    let status = lp.solve(p, c, basis ? { basis } : start === 'warm' ? { warm: true } : undefined);
    const ws = this.ws;
    for (let pass = 0; pass < 8 && status !== 'infeasible'; pass++) {
      // Friction and crushing rows of the rings, only where the solution breaks them.
      const before = ws.lazyCount;
      const lam = this.lamCol >= 0 ? (lp.x[this.lamCol] as number) : 0;
      for (let i = this.from; i <= this.to; i++) {
        const col = this.col[i] as number;
        ws.lazyCount = lazyScan(this.spans[i]!, lp.x[col] as number, lp.x[col + 1] as number, lp.x[col + 2] as number, lam, this.alpha, this.assemblyLaw, ws.lazy, ws.lazyCount, i << 16);
      }
      if (ws.lazyCount === before) break;
      this.writeLazyRows(before);
      status = lp.solve(p, c, { warm: true });
    }
    return status;
  }

  /* -- progressive collapse ----------------------------------------------------------------- */

  /** Can pier q stand with thrust from one side only (the span on the other side is gone)? */
  pierHoldsAlone(q: number, standing: number): boolean {
    const p = this.ws.p;
    this.lamCol = -1;
    this.sCol = -1;
    this.from = standing;
    this.to = standing;
    this.alpha = 1;
    this.assemblyLaw = this.law;
    p.reset(3);
    this.ws.lazyCount = 0;
    this.col[standing] = 0;
    this.row[standing] = 0;
    writeNoTension(p, this.spans[standing]!, 0, -1, -1, 1, null);
    p.add(0, 1);
    p.end(THRUST_CAP);
    this.writePier(q, standing === q ? 0 : -1, standing === q + 1 ? 0 : -1, 1, 0, 0);
    return this.solveWindow('thrust', 'cold') === 'optimal';
  }
}
