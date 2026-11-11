/**
 * The small LP solver (SIM-SPEC section 4).
 *
 *   maximise c·x   subject to   a_i·x <= b_i,   x free
 *
 * with a few dozen variables and up to a few thousand sparse rows. It runs the simplex method on
 * the dual, seen from the primal side: the basis is a set of n rows that are tight at the current
 * point x and whose multipliers y are non-negative (x is optimal for those rows alone); every
 * iteration brings in a violated row and drops the row the ratio test picks. Hidden box rows
 * |x_k| <= box give a first basis without a phase one; a box row with a positive multiplier at
 * the optimum means the real problem is unbounded.
 *
 * Only + - * / and comparisons are used, so results are bit-identical everywhere.
 */
import { log } from '../core/log';
import { LpProblem } from './lp-problem';
import { LP_BOX, LP_DUAL_TOL, LP_FEAS_TOL, LP_PIVOT_TOL, LP_PRICE_TOL, LP_REFACTOR_EVERY } from './tuning';

export type LpStatus = 'optimal' | 'infeasible' | 'unbounded';

export interface LpOptions {
  /** Use only the first `m` rows of the problem (the rest are a lazy tier added later). */
  m?: number;
  /** Start from this basis (row indices; negative values are box rows) instead of the box corner. */
  basis?: ArrayLike<number> | null;
  /** Continue from the basis the previous solve of the same problem ended with. */
  warm?: boolean;
}

const SMALL_M = 128;
const CHUNK = 16;

export class LpSolver {
  /** Solution (first n entries) and the multipliers of the basis rows (first n entries). */
  x = new Float64Array(8);
  y = new Float64Array(8);
  /** Row index per basis slot; -(2k+1) is the box row x_k <= box, -(2k+2) is -x_k <= box. */
  basis = new Int32Array(8);
  status: LpStatus = 'infeasible';
  objective = 0;
  iterations = 0;
  /** False when the iteration cap was hit (the result then counts as infeasible). */
  converged = true;

  private n = 0;
  private inv = new Float64Array(64);
  private work = new Float64Array(64);
  private w = new Float64Array(8);
  private inBasis = new Uint8Array(256);
  private skip = new Uint8Array(256);
  private anySkip = false;

  solve(p: LpProblem, c: ArrayLike<number>, options?: LpOptions): LpStatus {
    const n = p.n;
    const m = options?.m ?? p.m;
    this.ensure(n, m);
    this.converged = true;
    this.iterations = 0;
    if (this.anySkip) {
      this.skip.fill(0);
      this.anySkip = false;
    }

    let started = false;
    const sameSize = this.n === n;
    this.n = n;
    if (options?.warm === true && sameSize) {
      started = this.factor(p, c, m);
    } else if (options?.basis) {
      for (let i = 0; i < n; i++) this.basis[i] = options.basis[i] as number;
      started = this.factor(p, c, m);
    }
    if (!started) {
      this.coldStart(c);
      this.factor(p, c, m);
    }
    this.markBasis(m);

    this.status = this.iterate(p, c, m);
    let obj = 0;
    for (let k = 0; k < n; k++) obj += (c[k] as number) * (this.x[k] as number);
    this.objective = obj;
    return this.status;
  }

  private ensure(n: number, m: number): void {
    if (this.x.length < n) {
      this.x = new Float64Array(n * 2);
      this.y = new Float64Array(n * 2);
      this.w = new Float64Array(n * 2);
      this.basis = new Int32Array(n * 2);
    }
    if (this.inv.length < n * n) {
      this.inv = new Float64Array(n * n * 2);
      this.work = new Float64Array(n * n * 2);
    }
    if (this.inBasis.length < m) {
      this.inBasis = new Uint8Array(m * 2);
      this.skip = new Uint8Array(m * 2);
    }
  }

  /** The box corner the objective points at: optimal for the box rows alone. */
  private coldStart(c: ArrayLike<number>): void {
    for (let k = 0; k < this.n; k++) this.basis[k] = (c[k] as number) >= 0 ? -(2 * k + 1) : -(2 * k + 2);
  }

  private markBasis(m: number): void {
    this.inBasis.fill(0, 0, m);
    for (let i = 0; i < this.n; i++) {
      const r = this.basis[i] as number;
      if (r >= 0) this.inBasis[r] = 1;
    }
  }

  /**
   * Invert the basis matrix and recompute x and y from scratch. Returns false when the basis is
   * singular, refers to rows outside the problem, or has a negative multiplier (not a valid start).
   */
  private factor(p: LpProblem, c: ArrayLike<number>, m: number): boolean {
    const n = this.n;
    const a = this.work;
    const inv = this.inv;
    a.fill(0, 0, n * n);
    inv.fill(0, 0, n * n);
    for (let i = 0; i < n; i++) {
      inv[i * n + i] = 1;
      const r = this.basis[i] as number;
      if (r >= m) return false;
      if (r < 0) {
        const k = (-r - 1) >> 1;
        if (k >= n) return false;
        a[i * n + k] = (-r - 1) % 2 === 0 ? 1 : -1;
      } else {
        const end = p.rowStart[r + 1] as number;
        for (let q = p.rowStart[r] as number; q < end; q++) a[i * n + (p.cols[q] as number)] = p.vals[q] as number;
      }
    }
    // Gauss-Jordan with partial pivoting: a -> I, inv -> a^-1.
    for (let col = 0; col < n; col++) {
      let piv = col;
      let best = Math.abs(a[col * n + col] as number);
      for (let r = col + 1; r < n; r++) {
        const v = Math.abs(a[r * n + col] as number);
        if (v > best) {
          best = v;
          piv = r;
        }
      }
      if (best < 1e-11) return false;
      if (piv !== col) {
        for (let k = 0; k < n; k++) {
          let t = a[col * n + k] as number;
          a[col * n + k] = a[piv * n + k] as number;
          a[piv * n + k] = t;
          t = inv[col * n + k] as number;
          inv[col * n + k] = inv[piv * n + k] as number;
          inv[piv * n + k] = t;
        }
      }
      const d = 1 / (a[col * n + col] as number);
      for (let k = 0; k < n; k++) {
        a[col * n + k] = (a[col * n + k] as number) * d;
        inv[col * n + k] = (inv[col * n + k] as number) * d;
      }
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = a[r * n + col] as number;
        if (f === 0) continue;
        for (let k = 0; k < n; k++) {
          a[r * n + k] = (a[r * n + k] as number) - f * (a[col * n + k] as number);
          inv[r * n + k] = (inv[r * n + k] as number) - f * (inv[col * n + k] as number);
        }
      }
    }
    // x = inv * b_B,  y = inv^T * c.
    let ok = true;
    for (let i = 0; i < n; i++) this.y[i] = 0;
    for (let k = 0; k < n; k++) {
      let s = 0;
      const ck = c[k] as number;
      for (let i = 0; i < n; i++) {
        const v = inv[k * n + i] as number;
        const r = this.basis[i] as number;
        s += v * (r < 0 ? LP_BOX : (p.rhs[r] as number));
        this.y[i] = (this.y[i] as number) + ck * v;
      }
      this.x[k] = s;
    }
    for (let i = 0; i < n; i++) {
      const v = this.y[i] as number;
      if (v < 0) {
        if (v < -LP_DUAL_TOL) ok = false;
        this.y[i] = 0;
      }
    }
    return ok;
  }

  private iterate(p: LpProblem, c: ArrayLike<number>, m: number): LpStatus {
    const n = this.n;
    const x = this.x;
    const y = this.y;
    const w = this.w;
    const inv = this.inv;
    const maxIter = 400 + 60 * n;
    let degenerate = 0;
    let sinceFactor = 0;

    for (;;) {
      const bland = degenerate > 2 * n + 8;
      const r = this.price(p, m, bland);
      if (r === NONE) break;
      if (++this.iterations > maxIter) {
        this.converged = false;
        log.once('lp-iterations', 'sim', 'LP iteration cap reached; treating the problem as infeasible');
        return 'infeasible';
      }

      // w = inv^T a_r, and how far row r is violated.
      for (let i = 0; i < n; i++) w[i] = 0;
      let viol: number;
      if (r < 0) {
        const k = (-r - 1) >> 1;
        const sign = (-r - 1) % 2 === 0 ? 1 : -1;
        for (let i = 0; i < n; i++) w[i] = sign * (inv[k * n + i] as number);
        viol = sign * (x[k] as number) - LP_BOX;
      } else {
        const end = p.rowStart[r + 1] as number;
        viol = -(p.rhs[r] as number);
        for (let q = p.rowStart[r] as number; q < end; q++) {
          const k = p.cols[q] as number;
          const v = p.vals[q] as number;
          viol += v * (x[k] as number);
          const base = k * n;
          for (let i = 0; i < n; i++) w[i] = (w[i] as number) + v * (inv[base + i] as number);
        }
      }

      // Ratio test (Harris: allow a tiny bound violation to prefer a large pivot).
      let wmax = 1;
      for (let i = 0; i < n; i++) {
        const v = Math.abs(w[i] as number);
        if (v > wmax) wmax = v;
      }
      const wtol = LP_PIVOT_TOL * wmax;
      let limit = Infinity;
      for (let i = 0; i < n; i++) {
        const wi = w[i] as number;
        if (wi > wtol) {
          const t = ((y[i] as number) + LP_DUAL_TOL) / wi;
          if (t < limit) limit = t;
        }
      }
      if (limit === Infinity) {
        if (viol <= LP_FEAS_TOL && r >= 0) {
          // Tight within tolerance but dependent on the basis: nothing to fix.
          this.skip[r] = 1;
          this.anySkip = true;
          continue;
        }
        return 'infeasible';
      }
      let leave = -1;
      let bestW = 0;
      let bestId = 0;
      for (let i = 0; i < n; i++) {
        const wi = w[i] as number;
        if (wi <= wtol || (y[i] as number) / wi > limit) continue;
        if (bland) {
          const id = order(this.basis[i] as number);
          if (leave < 0 || id < bestId) {
            leave = i;
            bestId = id;
          }
        } else if (wi > bestW) {
          leave = i;
          bestW = wi;
        }
      }
      if (leave < 0) return 'infeasible';
      const wl = w[leave] as number;
      const theta = (y[leave] as number) / wl;
      degenerate = theta <= 1e-13 ? degenerate + 1 : 0;

      // Step: multipliers, then the point, then the inverse.
      for (let i = 0; i < n; i++) {
        const v = (y[i] as number) - theta * (w[i] as number);
        y[i] = v < 0 ? 0 : v;
      }
      y[leave] = theta;
      const t = -viol / wl;
      for (let k = 0; k < n; k++) {
        const base = k * n;
        const mi = (inv[base + leave] as number) / wl;
        x[k] = (x[k] as number) + t * (inv[base + leave] as number);
        if (mi !== 0) {
          for (let j = 0; j < n; j++) inv[base + j] = (inv[base + j] as number) - mi * (w[j] as number);
        }
        inv[base + leave] = mi;
      }
      const out = this.basis[leave] as number;
      if (out >= 0) this.inBasis[out] = 0;
      if (r >= 0) this.inBasis[r] = 1;
      this.basis[leave] = r;

      if (++sinceFactor >= LP_REFACTOR_EVERY) {
        sinceFactor = 0;
        this.factor(p, c, m);
      }
    }

    for (let i = 0; i < n; i++) {
      if ((this.basis[i] as number) < 0 && (y[i] as number) > LP_DUAL_TOL * 10) return 'unbounded';
    }
    return 'optimal';
  }

  /** The row to bring in: the most violated one (the lowest-numbered one under Bland's rule). */
  private price(p: LpProblem, m: number, bland: boolean): number {
    const n = this.n;
    const x = this.x;
    let best = NONE;
    let worst = LP_PRICE_TOL;

    // Box rows that have left the basis.
    for (let k = 0; k < n; k++) {
      const v = x[k] as number;
      const over = (v < 0 ? -v : v) - LP_BOX;
      if (over > worst) {
        const id = v > 0 ? -(2 * k + 1) : -(2 * k + 2);
        let inB = false;
        for (let i = 0; i < n; i++) if (this.basis[i] === id) inB = true;
        if (!inB) {
          worst = over;
          best = id;
        }
      }
    }

    const rowStart = p.rowStart;
    const cols = p.cols;
    const vals = p.vals;
    const rhs = p.rhs;
    const inBasis = this.inBasis;
    const skip = this.skip;

    if (bland) {
      // Smallest index among violated rows (real rows come before box rows in the order).
      for (let i = 0; i < m; i++) {
        if (inBasis[i] === 1 || skip[i] === 1) continue;
        let s = -(rhs[i] as number);
        const end = rowStart[i + 1] as number;
        for (let q = rowStart[i] as number; q < end; q++) s += (vals[q] as number) * (x[cols[q] as number] as number);
        if (s > LP_PRICE_TOL) return i;
      }
      return best;
    }

    if (m > SMALL_M) {
      // Partial pricing: the rows that mattered before are almost always the ones that matter now.
      const hot = p.hot;
      for (let h = 0; h < p.hotCount; h++) {
        const i = hot[h] as number;
        if (i >= m || inBasis[i] === 1 || skip[i] === 1) continue;
        let s = -(rhs[i] as number);
        const end = rowStart[i + 1] as number;
        for (let q = rowStart[i] as number; q < end; q++) s += (vals[q] as number) * (x[cols[q] as number] as number);
        if (s > worst) {
          worst = s;
          best = i;
        }
      }
      if (best !== NONE) return best;
    }

    // Full pass. For large problems the worst row of every chunk joins the hot list.
    const chunked = m > SMALL_M;
    let chunkBest = -1;
    let chunkWorst = LP_PRICE_TOL;
    for (let i = 0; i < m; i++) {
      if (chunked && i % CHUNK === 0) {
        if (chunkBest >= 0) p.markHot(chunkBest);
        chunkBest = -1;
        chunkWorst = LP_PRICE_TOL;
      }
      if (inBasis[i] === 1 || skip[i] === 1) continue;
      let s = -(rhs[i] as number);
      const end = rowStart[i + 1] as number;
      for (let q = rowStart[i] as number; q < end; q++) s += (vals[q] as number) * (x[cols[q] as number] as number);
      if (s > chunkWorst) {
        chunkWorst = s;
        chunkBest = i;
      }
      if (s > worst) {
        worst = s;
        best = i;
      }
    }
    if (chunked && chunkBest >= 0) p.markHot(chunkBest);
    return best;
  }
}

const NONE = 0x7fffffff;

/** Total order for Bland's rule: real rows by index, then box rows. */
function order(row: number): number {
  return row >= 0 ? row : 0x40000000 - row;
}

export interface DenseLpResult {
  status: LpStatus;
  x: number[];
  objective: number;
  /** Rows that hold with equality (within `LP_FEAS_TOL`) at the solution, ascending. */
  active: number[];
}

/** Convenience wrapper for dense data (tests, one-off questions). */
export function solveDenseLp(a: readonly (readonly number[])[], b: readonly number[], c: readonly number[]): DenseLpResult {
  const n = c.length;
  const p = new LpProblem(Math.max(8, a.length), Math.max(8, a.length * n));
  p.reset(n);
  for (let i = 0; i < a.length; i++) {
    const row = a[i] as readonly number[];
    for (let k = 0; k < n; k++) {
      const v = row[k] ?? 0;
      if (v !== 0) p.add(k, v);
    }
    p.end(b[i] ?? 0);
  }
  const solver = new LpSolver();
  const status = solver.solve(p, c);
  const x: number[] = [];
  for (let k = 0; k < n; k++) x.push(solver.x[k] as number);
  const active: number[] = [];
  if (status === 'optimal') {
    for (let i = 0; i < p.m; i++) if (Math.abs(p.slack(i, x)) <= LP_FEAS_TOL) active.push(i);
  }
  return { status, x, objective: solver.objective, active };
}

export { LpProblem };
