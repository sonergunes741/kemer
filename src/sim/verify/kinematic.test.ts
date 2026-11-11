/**
 * The kinematic (upper-bound) analysis of ./kinematic.ts against the simulation's static LP
 * answers. The two share no code; on the same discretised ring they must agree (uniqueness
 * theorem). A difference beyond 2 % is a defect in one of them.
 */
import { describe, expect, it, vi } from 'vitest';
import type { BridgeDesign, LevelDef } from '../../core/types';
import { BridgeModel } from '../bridge';
import { normalize } from '../design';
import { buildLayout } from '../geometry';
import { createSim } from '../index';
import { axleFootprint, buildSpanModel, setAxle } from '../loads';
import { spreadCapacity } from '../movement';
import { Workspace, solveAlpha, solveMultiplier } from '../ring';
import type { SpanModel } from '../span';
import { RIGID } from '../span';
import { FIXTURES } from '../testing/fixtures';
import { bareRing } from '../testing/rings';
import { axleCapacityAt, quakeCapacity } from '../transient';
import { filledRing } from './filled-ring';
import { analyse, minimumAlpha } from './kinematic';
import { circularRing, minimumThickness, tiltRing } from './kinematic-rings';
import { spreadLimit } from './spread';

// The bisections enumerate millions of mechanisms each: leave room on a busy machine.
vi.setConfig({ testTimeout: 90000 });

const ws = new Workspace();
const sim = createSim();
const COURSES = 81;
const TOLERANCE = 0.02;

function close(independent: number, simulation: number, floor = 0): boolean {
  return Math.abs(independent - simulation) <= Math.max(floor, TOLERANCE * Math.abs(simulation));
}

/** The LP's tilt capacity of a bare ring in one direction (rigid joints). */
function lpTilt(halfAngle: number, t: number, dir: 1 | -1, courses = COURSES): number {
  const sp = bareRing(halfAngle, t, courses);
  sp.setQuake(dir);
  return solveMultiplier(ws, sp, RIGID, 1);
}

/** The simulation's own span model of span 0 of a design, dry, scaled by its weight. */
function simSpan(level: LevelDef, design: BridgeDesign): { sp: SpanModel; layout: ReturnType<typeof buildLayout> } {
  const layout = buildLayout(level, normalize(level, design));
  const sp = buildSpanModel(layout, 0, layout.shapes[0]!.span);
  sp.W = sp.dryWeight();
  sp.place();
  sp.refresh();
  return { sp, layout };
}

const SINGLE_SPANS: readonly (readonly [string, LevelDef, (d: BridgeDesign) => void])[] = [
  ['a starter', FIXTURES.a, () => undefined],
  ['a thin 0.30', FIXTURES.a, (d) => void (d.spans[0]!.thickness = 0.3)],
  ['b starter (pointed)', FIXTURES.b, () => undefined],
  ['b full 1.0, t 0.7', FIXTURES.b, (d) => void ((d.spans[0]!.fullness = 1), (d.spans[0]!.thickness = 0.7))],
  ['d starter', FIXTURES.d, () => undefined],
  ['d flat rise 2.5', FIXTURES.d, (d) => void (d.spans[0]!.rise = 2.5)],
];

function designOf(level: LevelDef, change: (d: BridgeDesign) => void): BridgeDesign {
  const d = JSON.parse(JSON.stringify(level.starter)) as BridgeDesign;
  change(d);
  return d;
}

describe('kinematic analysis against the LP: bare circular rings', () => {
  const cases: readonly (readonly [number, number])[] = [
    [60, 0.05],
    [60, 0.09],
    [60, 0.15],
    [65, 0.06],
    [65, 0.09],
    [65, 0.15],
    [75, 0.08],
    [75, 0.12],
    [75, 0.18],
    [90, 0.12],
    [90, 0.15],
    [90, 0.2],
  ];

  it.each(cases)('tilt capacity, half-angle %d, t/R %d', (halfAngle, t) => {
    const kin = analyse(tiltRing(circularRing(halfAngle, t, COURSES), 1));
    const lp = lpTilt(halfAngle, t, 1);
    const m = kin.mechanism!;
    console.info(`tilt ${halfAngle} deg t/R ${t}: kinematic ${kin.multiplier.toFixed(4)} g vs LP ${lp.toFixed(4)} g; hinges ${m.joints.map((j, i) => `${j}${m.sides[i] === 0 ? 'i' : 'e'}`).join(' ')}`);
    expect(close(kin.multiplier, lp, 0.002)).toBe(true);
  });

  it('reproduces Oppenheim (1992): embrace 157.5 degrees, t/R = 0.15 becomes a mechanism at 0.37 g', () => {
    const kin = analyse(tiltRing(circularRing(78.75, 0.15, COURSES), 1)).multiplier;
    const lp = lpTilt(78.75, 0.15, 1);
    console.info(`Oppenheim's arch: kinematic ${kin.toFixed(4)} g vs LP ${lp.toFixed(4)} g (published 0.37 g)`);
    expect(Math.abs(kin - 0.37)).toBeLessThan(0.02);
    expect(close(kin, lp, 0.002)).toBe(true);
  });

  it('SIM-SPEC 11 row "semicircle at t/R = 0.108: about 0.32 g" cannot hold: that ring is at its minimum thickness', () => {
    const semicircle = analyse(tiltRing(circularRing(90, 0.108, COURSES), 1)).multiplier;
    const reading = analyse(tiltRing(circularRing(72.5, 0.108, COURSES), 1)).multiplier;
    console.info(`tilt at t/R 0.108: semicircle kinematic ${semicircle.toFixed(4)} g vs LP ${lpTilt(90, 0.108, 1).toFixed(4)} g; half-angle 72.5 kinematic ${reading.toFixed(4)} g vs LP ${lpTilt(72.5, 0.108, 1).toFixed(4)} g`);
    expect(semicircle).toBeLessThan(0.02);
    expect(Math.abs(reading - 0.32)).toBeLessThan(0.05);
  });

  it('gives the same capacity in both directions on a symmetric ring', () => {
    const shape = circularRing(65, 0.09, COURSES);
    const right = analyse(tiltRing(shape, 1)).multiplier;
    const left = analyse(tiltRing(shape, -1)).multiplier;
    expect(Math.abs(right - left)).toBeLessThan(1e-9);
    expect(Math.abs(lpTilt(65, 0.09, 1) - lpTilt(65, 0.09, -1))).toBeLessThan(1e-6);
  });

  it('loses nothing by trying only alternating hinge sides (41 courses, all sixteen patterns)', () => {
    for (const [halfAngle, t] of [
      [65, 0.09],
      [90, 0.15],
    ] as const) {
      const ring = tiltRing(circularRing(halfAngle, t, 41), 1);
      const alternating = analyse(ring).multiplier;
      const all = analyse(ring, { allPatterns: true }).multiplier;
      const lp = lpTilt(halfAngle, t, 1, 41);
      console.info(`tilt ${halfAngle} deg t/R ${t}, 41 courses: alternating ${alternating.toFixed(5)}, all patterns ${all.toFixed(5)}, LP ${lp.toFixed(5)}`);
      expect(all).toBeCloseTo(alternating, 9);
      expect(close(all, lp, 0.002)).toBe(true);
    }
  });

  it.each([60, 70, 80, 90])('minimum thickness, half-angle %d', (halfAngle) => {
    const kin = minimumThickness(halfAngle, COURSES);
    let lo = 0.005;
    let hi = 0.3;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (solveAlpha(ws, bareRing(halfAngle, mid, COURSES), RIGID) <= 1) hi = mid;
      else lo = mid;
    }
    console.info(`minimum t/R, half-angle ${halfAngle}: kinematic ${kin.toFixed(5)} vs LP ${hi.toFixed(5)}`);
    expect(close(kin, hi)).toBe(true);
  });

  it('semicircle just under its minimum thickness: the five-hinge mechanism, intrados hinges near 54.5 degrees', () => {
    const t = minimumThickness(90, COURSES);
    const r = analyse(tiltRing(circularRing(90, t * 0.98, COURSES), 1));
    const m = r.deadMechanism!;
    expect(r.deadMargin).toBeGreaterThan(0);
    const shape = circularRing(90, t * 0.98, COURSES);
    const angles = m.joints.map((j) => (Math.atan2(shape.a[j]!.x, shape.a[j]!.y) * 180) / Math.PI);
    console.info(`semicircle at 0.98 t_min: dead-load mechanism ${m.joints.map((j, i) => `${j}${m.sides[i] === 0 ? 'i' : 'e'}@${angles[i]!.toFixed(1)}`).join(' ')}`);
    const intrados = angles.filter((_, i) => m.sides[i] === 0).map((x) => Math.abs(x));
    for (const x of intrados) expect(Math.abs(x - 54.5)).toBeLessThan(3);
  });

  it.each([
    [90, 0.2],
    [90, 0.14],
    [60, 0.1],
    [75, 0.06],
  ])('geometric factor of safety, half-angle %d, t/R %d', (halfAngle, t) => {
    const kin = 1 / minimumAlpha(tiltRing(circularRing(halfAngle, t, COURSES), 1));
    const lp = 1 / solveAlpha(ws, bareRing(halfAngle, t, COURSES), RIGID);
    console.info(`gsf ${halfAngle} deg t/R ${t}: kinematic ${kin.toFixed(4)} vs LP ${lp.toFixed(4)}`);
    expect(close(kin, lp)).toBe(true);
  });
});

describe('spreading supports (SIM-SPEC 8), by rigid-body kinematics and virtual work', () => {
  it.each([
    [60, 0.1],
    [60, 0.06],
    [75, 0.12],
    [90, 0.16],
  ])('half-angle %d, t/R %d, 41 courses: span increase at collapse', (halfAngle, t) => {
    const shape = circularRing(halfAngle, t, 41);
    const span = shape.a[41]!.x - shape.a[0]!.x;
    const kin = spreadLimit(shape, 0.3 * span) / span;
    const sp = bareRing(halfAngle, t, 41);
    const lp = spreadCapacity(ws, sp, RIGID) / sp.shape.span;
    console.info(`spread ${halfAngle} deg t/R ${t}: kinematic ${(kin * 100).toFixed(2)} % of the span vs simulation ${(lp * 100).toFixed(2)} %`);
    expect(close(kin, lp, 0.001)).toBe(true);
  }, 120000);
});

describe('kinematic analysis against the LP: rings with fill (loads worked out independently)', () => {
  it.each(SINGLE_SPANS)('dead weight and gsf of %s', (_name, level, change) => {
    const design = designOf(level, change);
    const { sp } = simSpan(level, design);
    const ring = filledRing(sim.geometry(level, design), 0, sim.stones[level.stone].unitWeight);
    const gsfKin = 1 / minimumAlpha(ring.withQuake(1));
    const gsfLp = 1 / solveAlpha(ws, sp, RIGID);
    const insight = sim.insight(level, design).spans[0]!.gsf;
    console.info(`${_name}: weight independent ${ring.weight.toFixed(2)} vs sim ${sp.dryWeight().toFixed(2)} kN/m; gsf kinematic ${gsfKin.toFixed(4)} vs LP rigid ${gsfLp.toFixed(4)} (insight, real stone: ${insight.toFixed(4)})`);
    expect(close(ring.weight, sp.dryWeight())).toBe(true);
    expect(close(gsfKin, gsfLp)).toBe(true);
    // Friction and crushing can only lower the rigid answer.
    expect(insight).toBeLessThanOrEqual(gsfLp * (1 + 1e-6));
  });

  it.each(SINGLE_SPANS)('axle capacity along %s', (_name, level, change) => {
    const design = designOf(level, change);
    const { sp, layout } = simSpan(level, design);
    const shape = layout.shapes[0]!;
    const ring = filledRing(sim.geometry(level, design), 0, sim.stones[level.stone].unitWeight);
    const model = new BridgeModel(layout);
    const rows: string[] = [];
    let worst = 0;
    for (let k = 1; k <= 9; k++) {
      const x = shape.xL + (shape.span * k) / 10;
      const kin = analyse(ring.withAxle(x)).multiplier;
      const fp = axleFootprint(layout, shape, x);
      setAxle(sp, x, fp.length);
      const lp = solveMultiplier(ws, sp, RIGID, 1) * sp.W * fp.width;
      sp.clearSecond();
      const full = axleCapacityAt(model, 0, x, fp.length, fp.width);
      rows.push(`  x/s ${(k / 10).toFixed(1)}: kinematic ${kin.toFixed(1)} kN vs LP rigid ${lp.toFixed(1)} kN (real stone ${full.toFixed(1)} kN)`);
      const diff = Math.abs(kin - lp) / lp;
      if (diff > worst) worst = diff;
      expect(full).toBeLessThanOrEqual(lp * (1 + 1e-6));
    }
    console.info(`axle capacity, ${_name} (worst difference ${(worst * 100).toFixed(2)} %):\n${rows.join('\n')}`);
    expect(worst).toBeLessThan(TOLERANCE);
  });

  it.each(SINGLE_SPANS)('horizontal acceleration capacity of %s', (_name, level, change) => {
    const design = designOf(level, change);
    const { sp, layout } = simSpan(level, design);
    const geometry = sim.geometry(level, design);
    const gamma = sim.stones[level.stone].unitWeight;
    // The simulation used to put the deck load at mid-height of the fill (about 1 % too kind to
    // the bridge); it now uses the true heights, so that is the model to agree with.
    const kinMid = analyse(filledRing(geometry, 0, gamma, true).withQuake(1)).multiplier;
    const kinTrue = analyse(filledRing(geometry, 0, gamma, false).withQuake(1)).multiplier;
    sp.setQuake(1);
    const lp = solveMultiplier(ws, sp, RIGID, 1);
    sp.clearSecond();
    const full = quakeCapacity(new BridgeModel(layout));
    console.info(`quake, ${_name}: kinematic ${kinTrue.toFixed(4)} g vs LP rigid ${lp.toFixed(4)} g; with paving and parapets at mid-height of the fill ${kinMid.toFixed(4)} g; real stone ${full.toFixed(4)} g`);
    expect(close(kinTrue, lp, 0.002)).toBe(true);
    expect(full).toBeLessThanOrEqual(lp * (1 + 1e-6));
  });
});
