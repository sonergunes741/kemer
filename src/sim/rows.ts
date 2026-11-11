/**
 * LP rows of a span and what its solutions mean (SIM-SPEC sections 3 and 5): the no-tension rows,
 * the lazily added friction and crushing rows, the shrink factor a state needs, its line of
 * thrust and its hinges.
 */
import type { Hinge, HingeSide, Vec2 } from '../core/types';
import type { LpProblem } from './lp';
import type { JointLaw, SpanModel } from './span';
import { CRUSH_TANGENTS, HINGE_TOUCH } from './tuning';

const nvm = new Float64Array(3);

/**
 * The two no-tension rows of every joint, |M| <= alpha (d/2) N, as rows 2j (thrust towards the
 * intrados) and 2j + 1 (towards the extrados) counted from the first row written. Variables X, Y, m
 * sit at `col`..`col + 2`; `lamCol` and `sCol` (or -1) hold a load multiplier and a slack. The
 * slack enters with weight `weights[j]` (default d/2): maximising it finds the most central line.
 */
export function writeNoTension(p: LpProblem, sp: SpanModel, col: number, lamCol: number, sCol: number, alpha: number, weights: Float64Array | null): void {
  for (let j = 0; j <= sp.n; j++) {
    const half = (alpha * (sp.dh[j] as number)) / 2;
    const hn = half * (sp.nx[j] as number);
    const hy = half * (sp.ny[j] as number);
    const h0 = half * (sp.n0[j] as number);
    const hl = half * (sp.nl[j] as number);
    const mx = sp.mx[j] as number;
    const my = sp.my[j] as number;
    const m0 = sp.m0[j] as number;
    const ml = sp.ml[j] as number;
    const w = sCol >= 0 ? (weights ? (weights[j] as number) : (sp.dh[j] as number) / 2) : 0;
    p.add(col, mx - hn);
    p.add(col + 1, my - hy);
    p.add(col + 2, 1);
    if (lamCol >= 0) p.add(lamCol, ml - hl);
    if (sCol >= 0) p.add(sCol, w);
    p.end(h0 - m0);
    p.add(col, -mx - hn);
    p.add(col + 1, -my - hy);
    p.add(col + 2, -1);
    if (lamCol >= 0) p.add(lamCol, -ml - hl);
    if (sCol >= 0) p.add(sCol, w);
    p.end(h0 + m0);
  }
}

/**
 * The lazy tier: friction |V| <= mu N and the linearised crushing limit
 * |M| <= (d/2) ((alpha - 2u) N + u^2 sigma d) for each tangent u. These rarely bind, so a row is
 * only written once a solution breaks it (see lazyScan). A row is named by a code:
 * joint * 16 + kind * 2 + (1 for the negative sign), kind 0 = friction, 1.. = crushing tangent.
 */
export function writeLazyRow(p: LpProblem, sp: SpanModel, col: number, lamCol: number, sCol: number, alpha: number, law: JointLaw, weights: Float64Array | null, code: number): void {
  const j = code >> 4;
  const kind = (code >> 1) & 7;
  const sign = (code & 1) === 0 ? 1 : -1;
  const nx = sp.nx[j] as number;
  const ny = sp.ny[j] as number;
  if (kind === 0) {
    p.add(col, sign * (sp.ex[j] as number) - law.mu * nx);
    p.add(col + 1, sign * (sp.ey[j] as number) - law.mu * ny);
    if (lamCol >= 0) p.add(lamCol, sign * (sp.vl[j] as number) - law.mu * (sp.nl[j] as number));
    p.end(law.mu * (sp.n0[j] as number) - sign * (sp.v0[j] as number));
    return;
  }
  const u = CRUSH_TANGENTS[kind - 1] as number;
  const dh = sp.dh[j] as number;
  const half = ((alpha - 2 * u) * dh) / 2;
  const sigma = (law.sigma * sp.L) / sp.W;
  p.add(col, sign * (sp.mx[j] as number) - half * nx);
  p.add(col + 1, sign * (sp.my[j] as number) - half * ny);
  p.add(col + 2, sign);
  if (lamCol >= 0) p.add(lamCol, sign * (sp.ml[j] as number) - half * (sp.nl[j] as number));
  if (sCol >= 0) p.add(sCol, weights ? (weights[j] as number) : dh / 2);
  p.end((dh / 2) * u * u * sigma * dh + half * (sp.n0[j] as number) - sign * (sp.m0[j] as number));
}

/** Rows of the lazy tier are added when broken by more than this (looser than the LP's own tolerance, so no row is added twice). */
const LAZY_TOL = 1e-8;

/**
 * Append to `list` the codes (plus `tag`) of the lazy rows a state breaks; returns the new count.
 * In a problem with a slack column the crushing rows carry it too (`slack` times the joint's
 * weight), so a row counts as broken when it would stop that slack, not only when it is violated.
 */
export function lazyScan(
  sp: SpanModel,
  X: number,
  Y: number,
  m: number,
  lam: number,
  alpha: number,
  law: JointLaw,
  list: Int32Array,
  count: number,
  tag: number,
  slack = 0,
  weights: Float64Array | null = null,
): number {
  const friction = law.mu !== Infinity;
  const crushing = law.sigma !== Infinity;
  if (!friction && !crushing) return count;
  const sigma = crushing ? (law.sigma * sp.L) / sp.W : 0;
  const room = list.length;
  for (let j = 0; j <= sp.n; j++) {
    sp.forces(j, X, Y, m, lam, nvm);
    const N = nvm[0] as number;
    const V = nvm[1] as number;
    const M = nvm[2] as number;
    if (friction && Math.abs(V) > law.mu * N + LAZY_TOL && count < room) list[count++] = tag + j * 16 + (V > 0 ? 0 : 1);
    if (crushing) {
      const dh = sp.dh[j] as number;
      const absM = Math.abs(M) + (slack !== 0 ? slack * (weights ? (weights[j] as number) : dh / 2) : 0);
      for (let k = 0; k < CRUSH_TANGENTS.length; k++) {
        const u = CRUSH_TANGENTS[k] as number;
        if (absM > (dh / 2) * ((alpha - 2 * u) * N + u * u * sigma * dh) + LAZY_TOL && count < room) list[count++] = tag + j * 16 + (k + 1) * 2 + (M > 0 ? 0 : 1);
      }
    }
  }
  return count;
}

/**
 * The smallest shrink factor at which a state is admissible: max over joints of 2|eps|/d, plus
 * the crushing allowance when `law` has a finite strength. Infinity when a joint is in tension.
 * Optionally fills `weights` with (d/2) N for the next round of the alpha iteration.
 */
export function neededAlpha(sp: SpanModel, X: number, Y: number, m: number, lam: number, law: JointLaw | null, weights: Float64Array | null): number {
  const sigma = law && law.sigma !== Infinity ? (law.sigma * sp.L) / sp.W : Infinity;
  let worst = 0;
  let nMax = 0;
  for (let j = 0; j <= sp.n; j++) {
    sp.forces(j, X, Y, m, lam, nvm);
    const N = nvm[0] as number;
    const M = Math.abs(nvm[2] as number);
    const dh = sp.dh[j] as number;
    if (weights) weights[j] = N;
    if (N > nMax) nMax = N;
    if (N <= 1e-12) {
      if (M > 1e-12 || N < -1e-9) worst = Infinity;
      continue;
    }
    let need = (2 * M) / (dh * N);
    if (sigma !== Infinity) {
      let extra = 0;
      for (const u of CRUSH_TANGENTS) {
        const e = 2 * u - (u * u * sigma * dh) / N;
        if (e > extra) extra = e;
      }
      need += extra;
    }
    if (need > worst) worst = need;
  }
  if (weights) {
    // Weight (d/2) N, floored so nearly unloaded joints keep a usable row scale.
    const floor = 0.05 * nMax;
    for (let j = 0; j <= sp.n; j++) {
      const N = weights[j] as number;
      weights[j] = ((sp.dh[j] as number) / 2) * (N > floor ? N : floor);
    }
  }
  return worst;
}

/* -- reading a solution ---------------------------------------------------------------------- */

/** The thrust line of a state: where the resultant crosses each joint, in elevation coordinates. */
export function thrustLine(sp: SpanModel, X: number, Y: number, m: number, lam: number): Vec2[] {
  const line: Vec2[] = [];
  for (let j = 0; j <= sp.n; j++) {
    sp.forces(j, X, Y, m, lam, nvm);
    const N = nvm[0] as number;
    // eps = -M / N; with a joint in tension there is no crossing point: report the centre.
    const eps = N > 1e-12 ? (-(nvm[2] as number) * sp.L) / N : 0;
    line.push({
      x: ((sp.ax[j] as number) + (sp.bx[j] as number)) / 2 + eps * (sp.ex[j] as number),
      y: ((sp.ay[j] as number) + (sp.by[j] as number)) / 2 + eps * (sp.ey[j] as number),
    });
  }
  return line;
}

/** The joint centres: what stands in for a line of thrust when no state exists at all. */
export function centreLine(sp: SpanModel): Vec2[] {
  const line: Vec2[] = [];
  for (let j = 0; j <= sp.n; j++) line.push({ x: ((sp.ax[j] as number) + (sp.bx[j] as number)) / 2, y: ((sp.ay[j] as number) + (sp.by[j] as number)) / 2 });
  return line;
}

/**
 * Hinges of a state: joints where the thrust reaches the edge of the ring shrunk by alpha (less
 * the crushing allowance when `law` has a finite strength). Runs of neighbouring joints touching
 * on the same side count once, at the joint that touches hardest.
 */
export function hingesOf(sp: SpanModel, X: number, Y: number, m: number, lam: number, alpha: number, law: JointLaw | null = null): Hinge[] {
  const hinges: Hinge[] = [];
  const sigma = law && law.sigma !== Infinity ? (law.sigma * sp.L) / sp.W : Infinity;
  let runSide = 0;
  let runJoint = -1;
  let runRatio = 0;
  for (let j = 0; j <= sp.n + 1; j++) {
    let side = 0;
    let ratio = 0;
    if (j <= sp.n) {
      sp.forces(j, X, Y, m, lam, nvm);
      const N = nvm[0] as number;
      const M = nvm[2] as number;
      const dh = sp.dh[j] as number;
      let allowed = alpha;
      if (sigma !== Infinity && N > 1e-12) {
        for (const u of CRUSH_TANGENTS) allowed = Math.min(allowed, alpha - 2 * u + (u * u * sigma * dh) / N);
      }
      const limit = (allowed * dh * N) / 2;
      ratio = limit > 1e-12 ? Math.abs(M) / limit : Math.abs(M) > 1e-12 ? Infinity : 0;
      // M > 0 puts the thrust on the intrados side (eps < 0).
      if (ratio >= 1 - HINGE_TOUCH) side = M > 0 ? 1 : 2;
    }
    if (side !== runSide) {
      if (runSide !== 0) {
        const intr = runSide === 1;
        const side2: HingeSide = intr ? 'intrados' : 'extrados';
        hinges.push({ joint: runJoint, side: side2, at: { x: (intr ? sp.ax[runJoint] : sp.bx[runJoint]) as number, y: (intr ? sp.ay[runJoint] : sp.by[runJoint]) as number } });
      }
      runSide = side;
      runJoint = j;
      runRatio = ratio;
    } else if (side !== 0 && ratio > runRatio) {
      runJoint = j;
      runRatio = ratio;
    }
  }
  return hinges;
}
