/**
 * Audit of the statics against SIM-SPEC sections 3, 5 and 8 with checks that do not go through
 * the code they check: thrust lines against independently computed loads, kinematic admissibility
 * of reported hinges and of stone movements. The piers are in ./piers.test.ts.
 *
 * The last test was written to fail (collapsing spans handed over with two or three hinges); it
 * passes since ../mechanism.ts and stays as the regression test.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../core/rng';
import type { BridgeDesign, BridgeGeometry, LevelDef, SpanState, Vec2 } from '../../core/types';
import { normalize } from '../design';
import { buildLayout } from '../geometry';
import { createSim } from '../index';
import { buildSpanModel, setAxle, axleFootprint } from '../loads';
import { Workspace, solveMultiplier, solveThrust } from '../ring';
import { hingesOf } from '../rows';
import { RIGID } from '../span';
import { FIXTURES } from '../testing/fixtures';
import { filledRing } from './filled-ring';
import type { Side } from './kinematic';
import { evaluate } from './kinematic';
import { minimumThrust } from './kinematic-rings';

const sim = createSim();
const ws = new Workspace();

function variant(level: LevelDef, change: (d: BridgeDesign) => void): BridgeDesign {
  const d = JSON.parse(JSON.stringify(level.starter)) as BridgeDesign;
  change(d);
  return d;
}

const SAMPLES: readonly (readonly [string, LevelDef, BridgeDesign])[] = [
  ['a starter', FIXTURES.a, FIXTURES.a.starter],
  ['a tall thin', FIXTURES.a, variant(FIXTURES.a, (d) => void ((d.spans[0]!.rise = 3.4), (d.spans[0]!.thickness = 0.3)))],
  ['b starter', FIXTURES.b, FIXTURES.b.starter],
  ['b failing', FIXTURES.b, variant(FIXTURES.b, (d) => void ((d.spans[0]!.rise = 21), (d.spans[0]!.thickness = 0.6)))],
  ['c starter', FIXTURES.c, FIXTURES.c.starter],
  ['d starter', FIXTURES.d, FIXTURES.d.starter],
];

describe('thrust lines and hinges (SIM-SPEC 3, 5)', () => {
  it.each(SAMPLES)('%s: every thrust point lies on its joint, inside the ring shrunk by 1/gsf; hinges sit on joint ends', (_name, level, design) => {
    const geometry = sim.geometry(level, design);
    const insight = sim.insight(level, design);
    insight.spans.forEach((s, i) => {
      const joints = geometry.spans[i]!.joints;
      expect(s.thrustLine.length).toBe(joints.length);
      const alpha = 1 / s.gsf;
      s.thrustLine.forEach((p, j) => {
        const { a, b } = joints[j]!;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        const off = ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / d;
        const along = ((b.x - a.x) * (p.x - a.x) + (b.y - a.y) * (p.y - a.y)) / (d * d);
        expect(Math.abs(off)).toBeLessThan(1e-7);
        if (s.gsf < 49) expect(Math.abs(along - 0.5)).toBeLessThanOrEqual(alpha / 2 + 1e-6);
      });
      for (const h of s.hinges) {
        const joint = joints[h.joint]!;
        const end = h.side === 'intrados' ? joint.a : joint.b;
        expect(Math.hypot(h.at.x - end.x, h.at.y - end.y)).toBeLessThan(1e-9);
        // The line is on the hinge's side of the joint centre.
        const p = s.thrustLine[h.joint]!;
        const towards = (p.x - (joint.a.x + joint.b.x) / 2) * (end.x - (joint.a.x + joint.b.x) / 2) + (p.y - (joint.a.y + joint.b.y) / 2) * (end.y - (joint.a.y + joint.b.y) / 2);
        expect(towards).toBeGreaterThan(0);
      }
      for (let k = 1; k < s.hinges.length; k++) expect(s.hinges[k]!.joint).toBeGreaterThan(s.hinges[k - 1]!.joint);
    });
  });

  it.each([SAMPLES[0]!, SAMPLES[2]!, SAMPLES[5]!])('%s: the reported line is a funicular of independently computed loads', (_name, level, design) => {
    const geometry = sim.geometry(level, design);
    const ring = filledRing(geometry, 0, sim.stones[level.stone].unitWeight);
    const line = sim.insight(level, design).spans[0]!.thrustLine;
    // Unknown reaction (Rx, Ry) and its moment m0: at every joint the resultant of the reaction and
    // the loads to its left must pass through the thrust point. Least squares over all joints.
    const rows: number[][] = [];
    const rhs: number[] = [];
    let fy = 0;
    let g = 0;
    for (let j = 0; j < line.length; j++) {
      rows.push([line[j]!.y, -line[j]!.x, 1]);
      rhs.push(line[j]!.x * fy - g);
      if (j < ring.dead.length) {
        fy += ring.dead[j]!.fy;
        g += ring.dead[j]!.mo;
      }
    }
    const [rx, ry, m0] = leastSquares3(rows, rhs);
    let worst = 0;
    fy = 0;
    g = 0;
    for (let j = 0; j < line.length; j++) {
      const moment = m0 + g - (line[j]!.x * (ry + fy) - line[j]!.y * rx);
      worst = Math.max(worst, Math.abs(moment) / Math.hypot(rx, ry + fy));
      if (j < ring.dead.length) {
        fy += ring.dead[j]!.fy;
        g += ring.dead[j]!.mo;
      }
    }
    console.info(`${_name}: shown line has thrust ${rx.toFixed(1)} kN/m, left reaction ${ry.toFixed(1)} of ${ring.weight.toFixed(1)} kN/m; worst distance from the independent funicular ${(worst * 1000).toFixed(2)} mm`);
    expect(worst).toBeLessThan(0.005);
    expect(Math.abs(ry - ring.weight / 2)).toBeLessThan(0.01 * ring.weight);
  });

  it.each([SAMPLES[0]!, SAMPLES[2]!, SAMPLES[5]!])('%s: minimum thrust by virtual work equals the LP', (_name, level, design) => {
    const nd = normalize(level, design);
    const layout = buildLayout(level, nd);
    const sp = buildSpanModel(layout, 0, layout.shapes[0]!.span);
    sp.W = sp.dryWeight();
    sp.place();
    sp.refresh();
    expect(solveThrust(ws, sp, RIGID, 1, 1)).toBe('optimal');
    const lp = sp.sol[0]! * sp.W;
    const kin = minimumThrust(filledRing(sim.geometry(level, design), 0, sim.stones[level.stone].unitWeight).withQuake(1));
    const shown = sim.insight(level, design).spans[0]!.thrust;
    console.info(`${_name}: minimum thrust kinematic ${kin.thrust.toFixed(2)} vs LP rigid ${lp.toFixed(2)} kN/m (insight, real stone: ${shown.toFixed(2)})`);
    expect(Math.abs(kin.thrust - lp)).toBeLessThan(0.02 * lp);
    expect(shown).toBeGreaterThanOrEqual(lp * (1 - 1e-6));
  });

  it('the hinges the LP reports for an axle are a kinematically admissible mechanism that returns the same capacity', () => {
    for (const [name, level, design] of [SAMPLES[0]!, SAMPLES[2]!]) {
      const nd = normalize(level, design);
      const layout = buildLayout(level, nd);
      const shape = layout.shapes[0]!;
      const sp = buildSpanModel(layout, 0, shape.span);
      sp.W = sp.dryWeight();
      sp.place();
      sp.refresh();
      const ring = filledRing(sim.geometry(level, design), 0, sim.stones[level.stone].unitWeight);
      for (const share of [0.3, 0.5, 0.7]) {
        const x = shape.xL + share * shape.span;
        const fp = axleFootprint(layout, shape, x);
        setAxle(sp, x, fp.length);
        const capacity = solveMultiplier(ws, sp, RIGID, 1) * sp.W * fp.width;
        const hinges = hingesOf(sp, sp.sol[0]!, sp.sol[1]!, sp.sol[2]!, sp.sol[3]!, 1);
        sp.clearSecond();
        expect(hinges.length).toBeGreaterThanOrEqual(4);
        const four = hinges.slice(0, 4);
        const m = evaluate(ring.withAxle(x), four.map((h) => h.joint), four.map((h) => (h.side === 'intrados' ? 0 : 1) as Side));
        const viaWork = -m.deadWork / m.liveWork;
        console.info(`${name}, axle at ${share}: LP ${capacity.toFixed(1)} kN, its hinges ${four.map((h) => `${h.joint}${h.side[0]}`).join(' ')} give ${viaWork.toFixed(1)} kN by virtual work, direction ${m.direction}`);
        expect(m.direction).not.toBe(0);
        expect(m.liveWork).toBeGreaterThan(0);
        expect(Math.abs(viaWork - capacity)).toBeLessThan(0.02 * capacity);
        // The rule CollapseInfo.sense is built on: a first hinge on the intrados turns the stones after it clockwise.
        expect(m.direction).toBe(four[0]!.side === 'intrados' ? -1 : 1);
      }
    }
  });

  it('strike collapse: hinges and sense describe a mechanism gravity drives', () => {
    for (const [name, level, design] of [SAMPLES[3]!, ['a too thin', FIXTURES.a, variant(FIXTURES.a, (d) => void ((d.spans[0]!.rise = 3.5), (d.spans[0]!.thickness = 0.25)))] as const]) {
      const strike = sim.strike(level, design);
      expect(strike.stands).toBe(false);
      const fall = strike.collapse!.spans[0]!;
      expect(fall.hinges.length).toBeGreaterThanOrEqual(4);
      for (let k = 1; k < fall.hinges.length; k++) expect(fall.hinges[k]!.side).not.toBe(fall.hinges[k - 1]!.side);
      const ring = filledRing(sim.geometry(level, design), 0, sim.stones[level.stone].unitWeight).withQuake(1);
      // Any four consecutive hinges of the list are a one-degree-of-freedom mechanism.
      let driven = 0;
      for (let k = 0; k + 4 <= fall.hinges.length; k++) {
        const four = fall.hinges.slice(k, k + 4);
        const m = evaluate(ring, four.map((h) => h.joint), four.map((h) => (h.side === 'intrados' ? 0 : 1) as Side));
        expect(m.direction).not.toBe(0);
        if (m.deadWork > 0) driven++;
        if (k === 0) expect(fall.sense).toBe(m.direction === -1 ? 1 : -1);
      }
      console.info(`${name}: strike collapse hinges ${fall.hinges.map((h) => `${h.joint}${h.side[0]}`).join(' ')} sense ${fall.sense}; ${driven} of ${fall.hinges.length - 3} sub-mechanisms driven by gravity`);
      expect(driven).toBeGreaterThan(0);
    }
  });
});

/** Solve the 3-unknown least-squares problem rows x = rhs by its normal equations. */
function leastSquares3(rows: readonly number[][], rhs: readonly number[]): [number, number, number] {
  const a = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  for (let r = 0; r < rows.length; r++) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) a[i]![j]! += rows[r]![i]! * rows[r]![j]!;
      a[i]![3]! += rows[r]![i]! * rhs[r]!;
    }
  }
  for (let i = 0; i < 3; i++) {
    let pivot = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(a[r]![i]!) > Math.abs(a[pivot]![i]!)) pivot = r;
    [a[i], a[pivot]] = [a[pivot]!, a[i]!];
    for (let r = 0; r < 3; r++) {
      if (r === i) continue;
      const f = a[r]![i]! / a[i]![i]!;
      for (let c = i; c < 4; c++) a[r]![c]! -= f * a[i]![c]!;
    }
  }
  return [a[0]![3]! / a[0]![0]!, a[1]![3]! / a[1]![1]!, a[2]![3]! / a[2]![2]!];
}

describe('moving supports (SIM-SPEC 8)', () => {
  /**
   * Where a point of voussoir k has gone: translation of the centroid plus rotation about it.
   * k = -1 is the left support (it stays), k = n the right support (it moves apart and down).
   */
  function moved(geometry: BridgeGeometry, state: SpanState, k: number, p: Vec2): Vec2 {
    if (k < 0) return p;
    if (k >= state.shifts.length) return { x: p.x + state.spread, y: p.y - state.drop };
    const c = geometry.spans[0]!.voussoirs[k]!.centroid;
    const s = state.shifts[k]!;
    const cos = Math.cos(s.rot);
    const sin = Math.sin(s.rot);
    return { x: c.x + s.dx + cos * (p.x - c.x) - sin * (p.y - c.y), y: c.y + s.dy + sin * (p.x - c.x) + cos * (p.y - c.y) };
  }

  it('fixture d on yielding clay: stones stay in contact at closed joints, pivot on the reported hinge points, and joints open away from them', () => {
    const level = FIXTURES.d;
    const run = sim.run(level, level.starter);
    run.advance(1700);
    const state = run.state.spans[0]!;
    const geometry = run.geometry;
    const joints = geometry.spans[0]!.joints;
    const n = geometry.spans[0]!.voussoirs.length;
    expect(state.spread).toBeGreaterThan(0.05);
    expect(state.hinges.length).toBe(3);
    const hingeAt = new Map(state.hinges.map((h) => [h.joint, h]));
    let worstClosed = 0;
    let worstPivot = 0;
    let opened = 0;
    for (let j = 0; j <= n; j++) {
      const { a, b } = joints[j]!;
      const hinge = hingeAt.get(j);
      const gapA = sub(moved(geometry, state, j, a), moved(geometry, state, j - 1, a));
      const gapB = sub(moved(geometry, state, j, b), moved(geometry, state, j - 1, b));
      if (!hinge) {
        worstClosed = Math.max(worstClosed, Math.hypot(gapA.x, gapA.y), Math.hypot(gapB.x, gapB.y));
        continue;
      }
      // The pivot is the joint end the hinge names; weathering has eaten into the intrados end.
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const e = { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
      const cut = Math.min(state.jointLoss, 0.92 * d);
      const pivot = hinge.side === 'intrados' ? { x: a.x + cut * e.x, y: a.y + cut * e.y } : b;
      const fromLeft = moved(geometry, state, j - 1, pivot);
      const fromRight = moved(geometry, state, j, pivot);
      worstPivot = Math.max(worstPivot, Math.hypot(fromLeft.x - fromRight.x, fromLeft.y - fromRight.y), Math.hypot(hinge.at.x - fromLeft.x, hinge.at.y - fromLeft.y));
      // The far end of the joint has opened: the right stone moved away along the joint normal
      // (e rotated clockwise points from the left stone to the right one).
      const far = hinge.side === 'intrados' ? gapB : gapA;
      const normal = { x: e.y, y: -e.x };
      const opening = far.x * normal.x + far.y * normal.y;
      console.info(`fixture d in 1700: hinge at joint ${j} (${hinge.side}) has opened ${(opening * 1000).toFixed(1)} mm at its far end`);
      expect(opening).toBeGreaterThan(0);
      opened++;
    }
    expect(opened).toBe(3);
    console.info(`  spread ${(state.spread * 100).toFixed(1)} cm, drop ${(state.drop * 100).toFixed(1)} cm, crown stone moved ${(state.shifts[(n - 1) / 2]!.dy * 100).toFixed(1)} cm; closed joints stay closed within ${worstClosed.toExponential(1)} m, pivots agree within ${worstPivot.toExponential(1)} m`);
    expect(worstClosed).toBeLessThan(1e-9);
    expect(worstPivot).toBeLessThan(1e-9);
    // The last stone rides on the right support.
    const last = state.shifts[n - 1]!;
    const lastHinge = state.hinges[2]!.joint;
    if (lastHinge < n) {
      expect(last.dx).toBeCloseTo(state.spread, 9);
      expect(last.dy).toBeCloseTo(-state.drop, 9);
      expect(last.rot).toBeCloseTo(0, 12);
    }
  });
});

function sub(p: Vec2, q: Vec2): Vec2 {
  return { x: p.x - q.x, y: p.y - q.y };
}

describe('collapse mechanisms handed to the bridge view (CollapseInfo)', () => {
  it('every span that falls as a mechanism comes with at least four hinges', () => {
    const rng = new Rng(77);
    const counts = new Map<number, number>();
    let total = 0;
    let short = 0;
    let example = '';
    for (const key of ['a', 'b', 'c', 'd'] as const) {
      const level = FIXTURES[key];
      for (let i = 0; i < 60; i++) {
        const design = variant(level, (d) => {
          for (const s of d.spans) {
            s.rise = rng.range(1, 10);
            s.thickness = rng.range(level.limits.thickness[0], level.limits.thickness[1]);
            s.fullness = rng.range(0, 1);
          }
          d.linked = false;
        });
        const run = sim.run(level, design);
        run.advance(level.endYear);
        const collapse = run.summary().collapse;
        if (!collapse) continue;
        for (const s of collapse.spans) {
          // A span swept off by a flood has no hinges by design.
          if (collapse.cause === 'flood-wash' && s.hinges.length === 0) continue;
          total++;
          counts.set(s.hinges.length, (counts.get(s.hinges.length) ?? 0) + 1);
          if (s.hinges.length < 4) {
            short++;
            if (example === '') example = `fixture ${key}, ${collapse.cause} in ${collapse.year}, span ${s.span}: ${s.hinges.map((h) => `${h.joint}${h.side[0]}`).join(' ')}`;
          }
        }
      }
    }
    console.info(`collapsing spans: ${total}; hinges reported: ${[...counts].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k} hinges x${n}`).join(', ')}; first short one: ${example}`);
    expect(short).toBe(0);
  }, 120000);
});
