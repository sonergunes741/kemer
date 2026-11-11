/**
 * Questions asked of one span with its supports fixed (SIM-SPEC section 5): the geometric factor
 * of safety, the thrust range, load multipliers. Each is one or a few small LPs over (X, Y, m).
 *
 * Row layout of every span problem here: the no-tension rows (2 per joint), then the lazy rows
 * (friction, crushing) in the order they were found necessary.
 */
import type { LpStatus } from './lp';
import { LpProblem, LpSolver } from './lp';
import type { JointLaw, SpanModel } from './span';
import { lazyScan, neededAlpha, writeLazyRow, writeNoTension } from './rows';
import { ALPHA_MAX, ALPHA_MIN, COURSES_MAX, CRUSHING_CAP, GSF_CAP, GSF_MAX_ROUNDS, GSF_TOL, THRUST_CAP } from './tuning';

/** Most rounds of "solve, add the rows the solution breaks, solve again". */
const LAZY_ROUNDS = 8;

/** Shared workspace: one problem, one solver, no allocation per question. */
export class Workspace {
  readonly p = new LpProblem(1024, 8192);
  readonly lp = new LpSolver();
  readonly c = new Float64Array(64);
  readonly weights = new Float64Array(COURSES_MAX + 2);
  readonly nvm = new Float64Array(3);
  /** Codes of the lazy rows in the current problem, in row order (see writeLazyRow). */
  readonly lazy = new Int32Array(4096);
  lazyCount = 0;
}

/**
 * Solve the problem in ws.p (variables X, Y, m at columns 0..2), then keep adding the friction
 * and crushing rows the solution breaks until it breaks none. Rows already in ws.lazy must have
 * been written by the caller.
 */
function solveLazily(ws: Workspace, sp: SpanModel, law: JointLaw, alpha: number, lamCol: number, sCol: number, weights: Float64Array | null, warm: boolean): LpStatus {
  const { p, lp, c } = ws;
  let status = lp.solve(p, c, warm ? { warm: true } : undefined);
  for (let round = 0; round < LAZY_ROUNDS; round++) {
    // An unbounded answer sits on the hidden box: the crushing rows it breaks are what bound it.
    if (status === 'infeasible') break;
    const before = ws.lazyCount;
    const lam = lamCol >= 0 ? (lp.x[lamCol] as number) : 0;
    const slack = sCol >= 0 ? (lp.x[sCol] as number) : 0;
    ws.lazyCount = lazyScan(sp, lp.x[0] as number, lp.x[1] as number, lp.x[2] as number, lam, alpha, law, ws.lazy, before, 0, slack, weights);
    if (ws.lazyCount === before) break;
    for (let k = before; k < ws.lazyCount; k++) writeLazyRow(p, sp, 0, lamCol, sCol, alpha, law, weights, ws.lazy[k] as number);
    status = lp.solve(p, c, { warm: true });
  }
  return status;
}

/** A first guess of the state: the line through the centres of the springing joints and the crown. */
function guessState(sp: SpanModel): boolean {
  const j0 = 0;
  const j1 = (sp.n + 1) >> 1;
  const j2 = sp.n;
  // Three equations mx X + my Y + m = -m0.
  const a1 = sp.mx[j0] as number;
  const b1 = sp.my[j0] as number;
  const r1 = -(sp.m0[j0] as number);
  const a2 = (sp.mx[j1] as number) - a1;
  const b2 = (sp.my[j1] as number) - b1;
  const r2 = -(sp.m0[j1] as number) - r1;
  const a3 = (sp.mx[j2] as number) - a1;
  const b3 = (sp.my[j2] as number) - b1;
  const r3 = -(sp.m0[j2] as number) - r1;
  const det = a2 * b3 - a3 * b2;
  if (Math.abs(det) < 1e-12) return false;
  const X = (r2 * b3 - r3 * b2) / det;
  const Y = (a2 * r3 - a3 * r2) / det;
  sp.sol[0] = X;
  sp.sol[1] = Y;
  sp.sol[2] = r1 - a1 * X - b1 * Y;
  sp.sol[3] = 0;
  return true;
}

/**
 * alpha_min under dead load: the smallest shrink factor at which a line of thrust fits, with
 * friction and crushing honoured; gsf = 1 / alpha_min. Found from above: each round maximises a
 * slack on the alpha rows at the current alpha, then lowers alpha to exactly what that line needs
 * (a Dinkelbach iteration for the ratio max_j |M_j| / ((d_j / 2) N_j); it replaces the 22-step
 * bisection of the spec with a few LPs and lands on the same value). Leaves the state in sp.sol
 * and returns alpha (Infinity when no line exists at any alpha).
 */
export function solveAlpha(ws: Workspace, sp: SpanModel, law: JointLaw): number {
  const { p, lp, c } = ws;
  c[0] = 0;
  c[1] = 0;
  c[2] = 0;
  c[3] = 1;
  ws.lazyCount = 0;
  let alpha = ALPHA_MAX;
  let best = Infinity;
  let weights: Float64Array | null = null;
  if (guessState(sp)) {
    const need = neededAlpha(sp, sp.sol[0] as number, sp.sol[1] as number, sp.sol[2] as number, 0, law, ws.weights);
    // The guess ignores friction, so it only sets where the search starts, never the answer.
    if (need < ALPHA_MAX) {
      alpha = need;
      weights = ws.weights;
    }
  }
  for (let round = 0; round < GSF_MAX_ROUNDS; round++) {
    p.reset(4, round > 0);
    // Keep the problem bounded: a ring deep enough to hold a straight line has no thrust limit.
    p.add(0, 1);
    p.end(THRUST_CAP);
    writeNoTension(p, sp, 0, -1, 3, alpha, weights);
    for (let k = 0; k < ws.lazyCount; k++) writeLazyRow(p, sp, 0, -1, 3, alpha, law, weights, ws.lazy[k] as number);
    const status = solveLazily(ws, sp, law, alpha, -1, 3, weights, round > 0);
    if (status !== 'optimal') break;
    const X = lp.x[0] as number;
    const Y = lp.x[1] as number;
    const m = lp.x[2] as number;
    const slack = lp.x[3] as number;
    const need = neededAlpha(sp, X, Y, m, 0, law, ws.weights);
    weights = ws.weights;
    if (need < best) {
      best = need;
      sp.sol[0] = X;
      sp.sol[1] = Y;
      sp.sol[2] = m;
      sp.sol[3] = 0;
    }
    if (need === Infinity || need <= ALPHA_MIN) break;
    // Done when the line found needs (almost) all of alpha; a negative slack means alpha was too
    // small for any line (only possible on the first round), so the search restarts from `need`.
    if (slack >= 0 && alpha - need <= GSF_TOL * alpha) break;
    alpha = need;
  }
  return best;
}

/** gsf from alpha_min, kept in the reportable range (0 when no line exists at any alpha). */
export function gsfOf(alpha: number): number {
  if (!(alpha < Infinity)) return 0;
  return Math.min(GSF_CAP, 1 / Math.max(alpha, ALPHA_MIN));
}

/**
 * Maximise cX X + cY Y (+ cL lambda when `withLambda`) over the admissible states at a fixed
 * alpha. The state is left in sp.sol; lambda is 0 without the multiplier column.
 */
export function solveSpan(ws: Workspace, sp: SpanModel, law: JointLaw, alpha: number, cX: number, cY: number, cL: number, withLambda: boolean): LpStatus {
  const { p, lp, c } = ws;
  const n = withLambda ? 4 : 3;
  const lamCol = withLambda ? 3 : -1;
  c[0] = cX;
  c[1] = cY;
  c[2] = 0;
  c[3] = cL;
  ws.lazyCount = 0;
  p.reset(n);
  writeNoTension(p, sp, 0, lamCol, -1, alpha, null);
  const status = solveLazily(ws, sp, law, alpha, lamCol, -1, null, false);
  sp.sol[0] = lp.x[0] as number;
  sp.sol[1] = lp.x[1] as number;
  sp.sol[2] = lp.x[2] as number;
  sp.sol[3] = withLambda ? (lp.x[3] as number) : 0;
  return status;
}

/** Smallest (sense = 1) or largest (sense = -1) horizontal thrust at shrink factor alpha, scaled by W. */
export function solveThrust(ws: Workspace, sp: SpanModel, law: JointLaw, alpha: number, sense: 1 | -1): LpStatus {
  const status = solveSpan(ws, sp, law, alpha, -sense, 0, 0, false);
  if (sense === 1 && alpha === 1) {
    // Remember the tight rows: coupled problems (piers) start from them instead of from scratch.
    const rows = 2 * (sp.n + 1);
    let ok = status === 'optimal';
    for (let i = 0; i < 3 && ok; i++) ok = (ws.lp.basis[i] as number) >= 0 && (ws.lp.basis[i] as number) < rows;
    for (let i = 0; i < 3; i++) sp.thrustBasis[i] = ok ? (ws.lp.basis[i] as number) : -1;
    sp.thrustOk = status === 'optimal';
    for (let i = 0; i < 3; i++) sp.thrustState[i] = sp.sol[i] as number;
  }
  return status;
}

/**
 * The hinge (joint, side: 0 intrados / 1 extrados) a basis row of the last solveSpan problem
 * stands for, as joint * 2 + side; -1 for a row that is not a hinge (friction, a bound).
 */
export function hingeOfRow(ws: Workspace, sp: SpanModel, row: number): number {
  const rows = 2 * (sp.n + 1);
  if (row < 0) return -1;
  if (row < rows) return row;
  const k = row - rows;
  if (k >= ws.lazyCount) return -1;
  const code = ws.lazy[k] as number;
  if (((code >> 1) & 7) === 0) return -1;
  return (code >> 4) * 2 + (code & 1);
}

/**
 * Largest multiplier on the second load set (dead load fixed). Returns 0 when the dead load alone
 * has no admissible state and Infinity when nothing limits the multiplier.
 */
export function solveMultiplier(ws: Workspace, sp: SpanModel, law: JointLaw, alpha: number): number {
  const status = solveSpan(ws, sp, law, alpha, 0, 0, 1, true);
  if (status === 'infeasible') return 0;
  if (status === 'unbounded') return Infinity;
  return Math.max(0, sp.sol[3] as number);
}

/**
 * Highest edge stress over strength for the state in sp.sol, with a rectangular stress block
 * centred on the thrust: N / (sigma d (1 - 2|eps|/d)). Capped for display.
 */
export function crushingUse(ws: Workspace, sp: SpanModel, law: JointLaw): number {
  if (law.sigma === Infinity) return 0;
  const sigma = (law.sigma * sp.L) / sp.W;
  let worst = 0;
  for (let j = 0; j <= sp.n; j++) {
    sp.forces(j, sp.sol[0] as number, sp.sol[1] as number, sp.sol[2] as number, sp.sol[3] as number, ws.nvm);
    const N = ws.nvm[0] as number;
    if (N <= 0) continue;
    const dh = sp.dh[j] as number;
    const left = dh - (2 * Math.abs(ws.nvm[2] as number)) / N;
    const use = left > dh * 1e-3 ? N / (sigma * left) : CRUSHING_CAP;
    if (use > worst) worst = use;
  }
  return Math.min(CRUSHING_CAP, worst);
}

/** Mean normal stress on the joints for the state in sp.sol, kPa. */
export function meanStress(ws: Workspace, sp: SpanModel): number {
  let sum = 0;
  for (let j = 0; j <= sp.n; j++) {
    sp.forces(j, sp.sol[0] as number, sp.sol[1] as number, sp.sol[2] as number, sp.sol[3] as number, ws.nvm);
    sum += Math.max(0, ws.nvm[0] as number) / (sp.dh[j] as number);
  }
  return ((sum / (sp.n + 1)) * sp.W) / sp.L;
}
