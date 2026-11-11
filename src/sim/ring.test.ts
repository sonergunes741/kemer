import { describe, expect, it } from 'vitest';
import { DEG2RAD, RAD2DEG } from '../core/math';
import { archShape, intradosY, spanGeometry } from './arch';
import { Workspace, gsfOf, solveAlpha, solveMultiplier, solveThrust } from './ring';
import { RIGID } from './span';
import { hingesOf } from './rows';
import { bareRing } from './testing/rings';

const ws = new Workspace();

/** Smallest t/R at which a line of thrust still fits (alpha_min = 1), by bisection on the thickness. */
function minimumThickness(halfAngle: number): number {
  let lo = 0.001;
  let hi = 0.4;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (solveAlpha(ws, bareRing(halfAngle, mid), RIGID) <= 1) hi = mid;
    else lo = mid;
  }
  return hi;
}

function tiltCapacity(halfAngle: number, tOverR: number): number {
  let worst = Infinity;
  for (const dir of [1, -1]) {
    const sp = bareRing(halfAngle, tOverR);
    sp.setQuake(dir);
    worst = Math.min(worst, solveMultiplier(ws, sp, RIGID, 1));
  }
  return worst;
}

describe('arch shape', () => {
  it('s = 2, f = 1, q = 1 is a semicircle of radius 1 centred on the springing line', () => {
    const a = archShape(-1, 1, 0, 1, 1, 0.2);
    expect(a.r).toBeCloseTo(1, 12);
    expect(a.ox).toBeCloseTo(0, 12);
    expect(a.oy).toBeCloseTo(0, 12);
    expect(a.pointed).toBe(false);
    expect(intradosY(a, 0.6)).toBeCloseTo(0.8, 12);
  });

  it('cuts an odd number of courses with a keystone, counter-clockwise outlines and exact areas', () => {
    for (const [rise, q] of [
      [3, 1],
      [8, 1],
      [5, 0.3],
      [2, 0],
    ] as const) {
      const a = archShape(0, 10, 1, rise, q, 0.6);
      const g = spanGeometry(a, 0);
      expect(g.voussoirs.length % 2).toBe(1);
      expect(g.joints.length).toBe(g.voussoirs.length + 1);
      expect(g.voussoirs[(g.voussoirs.length - 1) / 2]!.keystone).toBe(true);
      expect(g.joints[0]!.a.x).toBeCloseTo(0, 9);
      expect(g.joints[g.joints.length - 1]!.a.x).toBeCloseTo(10, 9);
      for (const v of g.voussoirs) {
        // Shoelace area of the outline: positive (counter-clockwise) and equal to the exact area
        // within the chord error of the polyline.
        let area = 0;
        let cx = 0;
        const o = v.outline;
        for (let i = 0; i < o.length; i++) {
          const p = o[i]!;
          const q2 = o[(i + 1) % o.length]!;
          const cross = p.x * q2.y - q2.x * p.y;
          area += cross / 2;
          cx += (p.x + q2.x) * cross;
        }
        expect(area).toBeGreaterThan(0);
        expect(Math.abs(area - v.area)).toBeLessThan(0.02 * v.area);
        expect(Math.abs(cx / (6 * area) - v.centroid.x)).toBeLessThan(0.01);
        expect(o[0]!.x).toBeCloseTo(g.joints[v.index]!.a.x, 9);
      }
      if (a.pointed) {
        const key = g.voussoirs[(g.voussoirs.length - 1) / 2]!;
        expect(key.outline.some((p) => Math.abs(p.x - 5) < 1e-9 && Math.abs(p.y - (1 + rise)) < 1e-9)).toBe(true);
      }
    }
  });
});

describe('ring benchmarks (SIM-SPEC 11)', () => {
  it('semicircle: minimum t/R = 0.1075 with intrados hinges 54.5 degrees from the crown', () => {
    const t = minimumThickness(90);
    expect(Math.abs(t - 0.1075)).toBeLessThan(0.003);
    const sp = bareRing(90, t);
    const alpha = solveAlpha(ws, sp, RIGID);
    expect(alpha).toBeCloseTo(1, 4);
    const hinges = hingesOf(sp, sp.sol[0]!, sp.sol[1]!, sp.sol[2]!, 0, alpha);
    const intrados = hinges.filter((h) => h.side === 'intrados');
    expect(intrados.length).toBe(2);
    for (const h of intrados) {
      const fromCrown = Math.abs(Math.atan2(h.at.x, h.at.y)) * RAD2DEG;
      expect(Math.abs(fromCrown - 54.5)).toBeLessThan(3);
    }
    // Five hinges in all: springings and crown on the extrados.
    expect(hinges.filter((h) => h.side === 'extrados').length).toBeGreaterThanOrEqual(3);
    console.info(`semicircle: t/R min = ${t.toFixed(4)}, hinges at ${hinges.map((h) => `${h.joint}${h.side[0]}`).join(' ')}`);
  });

  it.each([
    [60, 0.0228],
    [70, 0.0413],
    [80, 0.0687],
  ])('half-angle %d: minimum t/R = %d', (halfAngle, expected) => {
    const t = minimumThickness(halfAngle);
    console.info(`half-angle ${halfAngle}: t/R min = ${t.toFixed(4)} (expected ${expected})`);
    expect(Math.abs(t - expected) / expected).toBeLessThan(0.05);
  });

  it('tilt: half-angle 65, t/R = 0.09 collapses at 0.38 g', () => {
    const g = tiltCapacity(65, 0.09);
    console.info(`tilt 65 deg, t/R 0.09: ${g.toFixed(3)} g`);
    expect(Math.abs(g - 0.38)).toBeLessThan(0.04);
  });

  // SIM-SPEC lists "semicircle at t/R = 0.108: about 0.32 g". That row of Ochsendorf's table 6.1
  // belongs to the embrace at which the first hinge reaches the support (half-angle = 90 - 17.5
  // degrees), not to the semicircle: a semicircle at 0.108 is at its minimum thickness (0.1075)
  // and has no reserve at all. All five rows of the table are checked under that reading.
  it.each([
    [0.011, 50, 8.0],
    [0.023, 60, 10.0],
    [0.041, 70, 12.5],
    [0.069, 80, 15.0],
    [0.108, 90, 17.5],
  ])('tilt: t/R = %d (minimum thickness at %d degrees) at half-angle alphaMax - gamma collapses at gamma = %d degrees', (t, alphaMax, gamma) => {
    const g = tiltCapacity(alphaMax - gamma, t);
    const expected = Math.tan(gamma * DEG2RAD);
    console.info(`tilt t/R ${t}, half-angle ${alphaMax - gamma}: ${g.toFixed(3)} g (expected ${expected.toFixed(3)})`);
    expect(Math.abs(g - expected)).toBeLessThan(0.02);
  });

  it('tilt: a semicircle at its minimum thickness has no reserve against tilting', () => {
    expect(tiltCapacity(90, 0.108)).toBeLessThan(0.02);
    expect(tiltCapacity(90, 0.14)).toBeGreaterThan(0.05);
  });
});

describe('span questions', () => {
  it('a span model has room for every array it hands out', () => {
    const sp = bareRing(90, 0.2, 41);
    expect(sp.dh.length).toBe(sp.n + 1);
    expect(sp.lg.length).toBe(sp.n);
    expect(sp.fillTop.length).toBe(sp.n * 5);
    // The last array taken ends exactly at the end of the shared store.
    expect(sp.lg.byteOffset + sp.lg.byteLength).toBe(sp.lg.buffer.byteLength);
  });

  it('gsf grows with thickness and the thrust range brackets the central line', () => {
    let last = 0;
    for (const t of [0.12, 0.16, 0.2, 0.3]) {
      const sp = bareRing(90, t);
      const gsf = gsfOf(solveAlpha(ws, sp, RIGID));
      expect(gsf).toBeGreaterThan(last);
      last = gsf;
      const central = sp.sol[0]!;
      expect(solveThrust(ws, sp, RIGID, 1, 1)).toBe('optimal');
      const min = sp.sol[0]!;
      expect(solveThrust(ws, sp, RIGID, 1, -1)).toBe('optimal');
      const max = sp.sol[0]!;
      expect(min).toBeLessThanOrEqual(central + 1e-9);
      expect(max).toBeGreaterThanOrEqual(central - 1e-9);
    }
  });

  it('a finite strength lowers gsf and a ring too weak to carry itself has none', () => {
    const sp = bareRing(90, 0.2);
    const rigid = solveAlpha(ws, sp, RIGID);
    // Strength in units of unit weight x R: mean stress here is of order 1.
    const strong = solveAlpha(ws, sp, { mu: 0.6, sigma: 500 });
    const weak = solveAlpha(ws, sp, { mu: 0.6, sigma: 12 });
    expect(strong).toBeGreaterThanOrEqual(rigid - 1e-9);
    expect(weak).toBeGreaterThan(strong);
  });
});
