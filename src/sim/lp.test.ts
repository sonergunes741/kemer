import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { LpProblem, LpSolver, solveDenseLp } from './lp';
import type { LpStatus } from './lp';

/* -- brute force: vertex and ray enumeration ------------------------------------------------- */

function det(m: number[][]): number {
  const n = m.length;
  if (n === 1) return m[0]![0]!;
  if (n === 2) return m[0]![0]! * m[1]![1]! - m[0]![1]! * m[1]![0]!;
  let d = 0;
  for (let j = 0; j < n; j++) {
    const minor = m.slice(1).map((row) => row.filter((_, k) => k !== j));
    d += (j % 2 === 0 ? 1 : -1) * m[0]![j]! * det(minor);
  }
  return d;
}

function solveSquare(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const d = det(a);
  if (Math.abs(d) < 1e-9) return null;
  // Cramer's rule: tiny systems only.
  const x: number[] = [];
  for (let j = 0; j < n; j++) {
    const aj = a.map((row, i) => row.map((v, k) => (k === j ? b[i]! : v)));
    x.push(det(aj) / d);
  }
  return x;
}

function subsets(m: number, k: number): number[][] {
  const out: number[][] = [];
  const pick: number[] = [];
  const walk = (start: number): void => {
    if (pick.length === k) {
      out.push(pick.slice());
      return;
    }
    for (let i = start; i < m; i++) {
      pick.push(i);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return out;
}

const dot = (a: readonly number[], b: readonly number[]): number => a.reduce((s, v, i) => s + v * b[i]!, 0);

interface Brute {
  status: LpStatus | 'skip';
  objective: number;
}

function bruteForce(a: number[][], b: number[], c: number[]): Brute {
  const m = a.length;
  const n = c.length;
  const tol = 1e-7;
  let pointed = false;
  let best = -Infinity;
  for (const s of subsets(m, n)) {
    const x = solveSquare(s.map((i) => a[i]!), s.map((i) => b[i]!));
    if (!x) continue;
    pointed = true;
    if (a.every((row, i) => dot(row, x) <= b[i]! + tol)) best = Math.max(best, dot(c, x));
  }
  if (!pointed) return { status: 'skip', objective: 0 };
  if (best === -Infinity) return { status: 'infeasible', objective: 0 };
  // Extreme rays of {A d <= 0}: null vectors of n-1 rows (generalised cross product).
  for (const s of subsets(m, n - 1)) {
    const rows = s.map((i) => a[i]!);
    const d: number[] = [];
    for (let j = 0; j < n; j++) {
      const minor = rows.map((row) => row.filter((_, k) => k !== j));
      d.push((j % 2 === 0 ? 1 : -1) * (n === 1 ? 1 : det(minor)));
    }
    const size = Math.sqrt(dot(d, d));
    if (size < 1e-9) continue;
    for (const sign of [1, -1]) {
      const r = d.map((v) => (sign * v) / size);
      if (a.every((row) => dot(row, r) <= 1e-9) && dot(c, r) > 1e-7) return { status: 'unbounded', objective: Infinity };
    }
  }
  return { status: 'optimal', objective: best };
}

function randomProblem(rng: Rng, integer: boolean): { a: number[][]; b: number[]; c: number[] } {
  const n = rng.int(2, 4);
  const m = rng.int(n + 1, n + 7);
  const value = (): number => (integer ? rng.int(-3, 3) : rng.range(-2, 2));
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < m; i++) {
    a.push(Array.from({ length: n }, value));
    // Integer right-hand sides from a tiny set make many vertices coincide (degenerate).
    b.push(integer ? rng.int(0, 2) : rng.range(-0.5, 3));
  }
  if (integer && rng.chance(0.3)) {
    // Duplicate and negate a row now and then: equality constraints and infeasible pairs.
    const i = rng.int(0, m - 1);
    a.push(a[i]!.map((v) => -v));
    b.push(rng.chance(0.5) ? -b[i]! : -b[i]! - 1);
  }
  const c = Array.from({ length: n }, value);
  return { a, b, c };
}

function checkAgainstBruteForce(seed: number, count: number, integer: boolean): Record<string, number> {
  const rng = new Rng(seed);
  const seen: Record<string, number> = { optimal: 0, infeasible: 0, unbounded: 0 };
  let done = 0;
  while (done < count) {
    const { a, b, c } = randomProblem(rng, integer);
    const expected = bruteForce(a, b, c);
    if (expected.status === 'skip') continue;
    done++;
    const got = solveDenseLp(a, b, c);
    const context = JSON.stringify({ a, b, c });
    expect(got.status, context).toBe(expected.status);
    seen[expected.status] = (seen[expected.status] ?? 0) + 1;
    if (expected.status !== 'optimal') continue;
    expect(Math.abs(got.objective - expected.objective), context).toBeLessThan(1e-6);
    for (let i = 0; i < a.length; i++) expect(dot(a[i]!, got.x), context).toBeLessThanOrEqual(b[i]! + 1e-6);
    // A vertex has at least n tight rows. (When the optimal face is unbounded the solver may
    // stop on the hidden box instead of a vertex; that point is still optimal.)
    if (got.x.every((v) => Math.abs(v) < 1e5)) expect(got.active.length, context).toBeGreaterThanOrEqual(c.length);
  }
  return seen;
}

describe('LP solver', () => {
  it('matches vertex enumeration on random generic problems', () => {
    const seen = checkAgainstBruteForce(1, 600, false);
    expect(seen.optimal).toBeGreaterThan(50);
    expect(seen.unbounded).toBeGreaterThan(50);
  });

  it('matches vertex enumeration on degenerate and infeasible integer problems', () => {
    const seen = checkAgainstBruteForce(7, 1500, true);
    expect(seen.optimal).toBeGreaterThan(100);
    expect(seen.infeasible).toBeGreaterThan(100);
    expect(seen.unbounded).toBeGreaterThan(50);
  });

  it('solves a textbook problem and reports the active rows', () => {
    // max x + y, x <= 2, y <= 3, x + y <= 4, -x <= 0, -y <= 0.
    const r = solveDenseLp(
      [
        [1, 0],
        [0, 1],
        [1, 1],
        [-1, 0],
        [0, -1],
      ],
      [2, 3, 4, 0, 0],
      [1, 1],
    );
    expect(r.status).toBe('optimal');
    expect(r.objective).toBeCloseTo(4, 9);
    expect(r.active).toContain(2);
  });

  it('copes with a heavily degenerate vertex', () => {
    // Forty rows through the same optimum (1, 1, 1).
    const rng = new Rng(3);
    const a: number[][] = [];
    const b: number[] = [];
    for (let i = 0; i < 40; i++) {
      const row = [rng.range(0.1, 1), rng.range(0.1, 1), rng.range(0.1, 1)];
      a.push(row);
      b.push(row[0]! + row[1]! + row[2]!);
    }
    const r = solveDenseLp(a, b, [1, 1, 1]);
    expect(r.status).toBe('optimal');
    expect(r.objective).toBeCloseTo(3, 7);
    expect(r.active.length).toBe(40);
  });

  it('gives the same optimum cold, warm with added rows, and from a given basis', () => {
    const rng = new Rng(11);
    const n = 30;
    const m = 3000;
    const p = new LpProblem();
    p.reset(n);
    // A polytope around the origin: sparse rows a·x <= 1 with a few coefficients each.
    for (let i = 0; i < m; i++) {
      const used = new Set<number>();
      for (let k = 0; k < 4; k++) {
        const col = i < 2 * n ? (i >> 1) % n : rng.int(0, n - 1);
        if (used.has(col)) continue;
        used.add(col);
        p.add(col, i < 2 * n ? (i % 2 === 0 ? 1 : -1) : rng.range(-1, 1));
        if (i < 2 * n) break;
      }
      p.end(1);
    }
    const c = Array.from({ length: n }, () => rng.range(-1, 1));
    const solver = new LpSolver();
    expect(solver.solve(p, c)).toBe('optimal');
    const cold = solver.objective;
    const basis = Array.from(solver.basis.slice(0, n));
    for (let i = 0; i < p.m; i++) expect(p.slack(i, solver.x)).toBeLessThan(1e-7);

    // First half of the rows, then all of them, continuing from the first basis.
    const second = new LpSolver();
    expect(second.solve(p, c, { m: m / 2 })).toBe('optimal');
    expect(second.objective).toBeGreaterThanOrEqual(cold - 1e-9);
    expect(second.solve(p, c, { warm: true })).toBe('optimal');
    expect(second.objective).toBeCloseTo(cold, 8);

    const third = new LpSolver();
    expect(third.solve(p, c, { basis })).toBe('optimal');
    expect(third.iterations).toBe(0);
    expect(third.objective).toBeCloseTo(cold, 9);
  });

  it('is deterministic', () => {
    const rng = new Rng(5);
    const { a, b, c } = randomProblem(rng, false);
    expect(solveDenseLp(a, b, c)).toEqual(solveDenseLp(a, b, c));
  });
});
