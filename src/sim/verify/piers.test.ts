/**
 * Audit of the piers (SIM-SPEC 6) and of two claims of sections 10 and 11.
 *
 * Five of these tests were written to fail: they stated what the specification asks for and the
 * simulation did not do (review findings on pier stability, gsf against thickness, and causes).
 * They pass since the fixes and stay as their regression tests. The gsf one passes because the
 * reported gsf now saturates (GSF_CAP in tuning.ts); what holds below the cap, and why no
 * definition of gsf is monotone in thickness on a filled bridge, is pinned in ../sim.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../core/rng';
import type { BridgeDesign, LevelDef, Vec2 } from '../../core/types';
import { BridgeModel } from '../bridge';
import { normalize } from '../design';
import { buildLayout } from '../geometry';
import { createSim } from '../index';
import { solveThrust } from '../ring';
import { thrustLine } from '../rows';
import { FIXTURES } from '../testing/fixtures';

const sim = createSim();

function variant(level: LevelDef, change: (d: BridgeDesign) => void): BridgeDesign {
  const d = JSON.parse(JSON.stringify(level.starter)) as BridgeDesign;
  change(d);
  return d;
}

describe('piers (SIM-SPEC 6)', () => {
  it('base forces of every pier of fixture c, by hand from the thrust lines, give the kappa the model uses', () => {
    const level = FIXTURES.c;
    const layout = buildLayout(level, normalize(level, level.starter));
    const model = new BridgeModel(layout);
    for (const sp of model.spans) expect(solveThrust(model.ws, sp, model.law, 1, 1)).toBe('optimal');
    const gamma = sim.stones[level.stone].unitWeight;
    for (let q = 0; q < layout.piers.length; q++) {
      const p = layout.piers[q]!;
      const left = model.spans[q]!;
      const right = model.spans[q + 1]!;
      const kappa = model.kappaFor(q, left.thrustState, right.thrustState);
      // Left span: its last joint passes (H, V - weight) to the pier at the thrust point there.
      const lineL = thrustLine(left, left.thrustState[0]!, left.thrustState[1]!, left.thrustState[2]!, 0);
      const lineR = thrustLine(right, right.thrustState[0]!, right.thrustState[1]!, right.thrustState[2]!, 0);
      let weightL = 0;
      for (let k = 0; k < left.n; k++) weightL += left.selfW[k]! + left.fillW[k]!;
      const forces: { at: Vec2; fx: number; fy: number }[] = [
        { at: lineL[left.n]!, fx: left.thrustState[0]! * model.W, fy: left.thrustState[1]! * model.W - weightL },
        // Right span: the pier is its left support and feels the opposite of the reaction it gives.
        { at: lineR[0]!, fx: -right.thrustState[0]! * model.W, fy: -right.thrustState[1]! * model.W },
        // Own weight, buoyant below normal water level (y = 0).
        { at: { x: p.x, y: (p.top + p.base) / 2 }, fx: 0, fy: -(gamma * p.width * (p.top - p.base) - 9.81 * p.width * Math.max(0, Math.min(0, p.top) - p.base)) },
        { at: { x: model.pierFillX[q]!, y: p.top }, fx: 0, fy: -model.pierFill[q]! },
      ];
      let N = 0;
      let V = 0;
      let M = 0;
      for (const f of forces) {
        N -= f.fy;
        V += f.fx;
        M += (f.at.x - p.x) * f.fy - (f.at.y - p.base) * f.fx;
      }
      const wb = p.width + 0.6;
      const bearing = sim.soils[p.soil].bearing * wb;
      let extra = 0;
      for (const u of [0.05, 0.15, 0.3, 0.6, 1]) extra = Math.max(extra, 2 * u - (u * u * bearing) / N);
      const byHand = (2 * Math.abs(M)) / (wb * N) + extra;
      console.info(`fixture c pier ${q}: N ${N.toFixed(0)} V ${V.toFixed(1)} M ${M.toFixed(0)} kN(m)/m; kappa by hand ${byHand.toFixed(5)} vs model ${kappa.toFixed(5)}; bearing ${(N / wb).toFixed(0)} of ${sim.soils[p.soil].bearing} kPa`);
      expect(Math.abs(V)).toBeLessThanOrEqual(sim.soils[p.soil].friction * N);
      expect(Math.abs(byHand - kappa)).toBeLessThan(1e-6 * Math.max(1, kappa));
    }
  });

  /** A flat 25 m span between two piers with a tall light span on the other side of each. */
  const lopsided: BridgeDesign = {
    v: 1,
    springLevel: 1.2,
    piers: [
      { x: 17.72, width: 4.26 },
      { x: 46.75, width: 2.68 },
    ],
    spans: [
      { rise: 7.43, fullness: 0.93, thickness: 1.32 },
      { rise: 2.56, fullness: 0.42, thickness: 1.17 },
      { rise: 10.38, fullness: 0.51, thickness: 1.11 },
    ],
    linked: false,
    cover: 0.56,
    foundation: 3.08,
    cutwaters: false,
    reliefs: true,
    clamps: false,
    piles: false,
  };
  const onRock: LevelDef = { ...FIXTURES.c, site: { ...FIXTURES.c.site, soils: [] } };

  it('a pier that must slide under unbalanced thrust is not reported as stable', () => {
    const design = normalize(onRock, lopsided);
    const layout = buildLayout(onRock, design);
    const model = new BridgeModel(layout);
    // Hand check of pier 0: the least the flat span can push, less the most the tall span can push
    // back, against friction under the most weight that can possibly stand on the pier.
    const range = (i: number): [number, number] => {
      const sp = model.spans[i]!;
      expect(solveThrust(model.ws, sp, model.law, 1, 1)).toBe('optimal');
      const min = sp.sol[0]! * model.W;
      expect(solveThrust(model.ws, sp, model.law, 1, -1)).toBe('optimal');
      return [min, sp.sol[0]! * model.W];
    };
    const [, tallMax] = range(0);
    const [flatMin] = range(1);
    const weight = (i: number): number => model.spans[i]!.dryWeight();
    // No more than 0.65 of a symmetric span's weight can come down on one springing here (the
    // thrust points at the two springings differ in height by less than the ring thickness).
    const mostN = model.pierSelf0[0]! + model.pierFill[0]! + 0.65 * (weight(0) + weight(1));
    const friction = sim.soils.rock.friction;
    console.info(`lopsided bridge, pier 0: unbalanced thrust at least ${(flatMin - tallMax).toFixed(0)} kN/m against friction of at most ${(friction * mostN).toFixed(0)} kN/m`);
    expect(flatMin - tallMax).toBeGreaterThan(friction * mostN);

    const insight = sim.insight(onRock, design);
    const strike = sim.strike(onRock, design);
    console.info(`  simulation: pier stability ${insight.piers.map((p) => p.stability.toFixed(2)).join(' / ')}, safety ${insight.safety.toFixed(2)}, strike stands ${strike.stands}, axle capacity ${sim.capacities(onRock, design).axle}`);
    expect(Math.min(...insight.piers.map((p) => p.stability))).toBeLessThan(1);
    expect(strike.stands).toBe(false);
  });

  it('fixture c as it is, linked spans, two piers placed off-centre: the pier beside the long span cannot hold it', () => {
    const level = FIXTURES.c;
    const design = normalize(level, {
      ...level.starter,
      piers: [
        { x: 10, width: 3 },
        { x: 22, width: 3 },
      ],
      spans: [0, 1, 2].map(() => ({ rise: 3, fullness: 1, thickness: 0.8 })),
      linked: true,
    });
    const insight = sim.insight(level, design);
    const strike = sim.strike(level, design);
    const capacities = sim.capacities(level, design);
    const run = sim.run(level, design);
    run.advance(level.endYear);
    const summary = run.summary();
    console.info(
      `fixture c, piers at 10 and 22, linked rise ${design.spans[0]!.rise.toFixed(2)}: thrusts ${insight.spans.map((s) => s.thrust.toFixed(0)).join(' / ')} kN/m, pier stability ${insight.piers.map((p) => p.stability.toFixed(2)).join(' / ')}, safety ${insight.safety.toFixed(2)}, strike stands ${strike.stands}; ` +
        `but axle capacity ${capacities.axle} kN, quake capacity ${capacities.quake} g, and the run ends in ${summary.lastYear} of '${summary.collapse?.cause}' (piers down: ${summary.collapse?.piers.join(',')})`,
    );
    // A bridge that carries no load at all and falls at its first check did not stand at strike.
    expect(capacities.axle > 0 || !strike.stands).toBe(true);
    expect(summary.lastYear > level.year + 10 || !strike.stands).toBe(true);
  });

  it('whenever insight says safe, the dead-load problem of the whole bridge has a solution (fixture c, 300 random designs)', () => {
    const level = FIXTURES.c;
    const rng = new Rng(20261111);
    const length = level.site.right - level.site.left;
    let unsafe = 0;
    let conservative = 0;
    let first = '';
    for (let trial = 0; trial < 300; trial++) {
      const np = rng.int(level.limits.minPiers, level.limits.maxPiers);
      const design = normalize(level, {
        ...level.starter,
        piers: Array.from({ length: np }, () => ({ x: level.site.left + rng.range(0.1, 0.9) * length, width: rng.range(2, 5) })),
        spans: Array.from({ length: np + 1 }, () => ({ rise: rng.range(1, 9), fullness: rng.range(0.4, 1), thickness: rng.range(0.4, 1.5) })),
        linked: rng.chance(0.3),
        foundation: rng.range(1.5, 5),
        piles: rng.chance(0.3),
      });
      const insight = sim.insight(level, design);
      const model = new BridgeModel(buildLayout(level, design));
      model.assemble(0, model.count - 1, false, false, -1, 1, 0, 0, false);
      const feasible = model.solveWindow('thrust', 'cold') === 'optimal';
      if (!feasible && insight.safety > 1 + 1e-4) {
        unsafe++;
        if (first === '') first = `safety ${insight.safety.toFixed(2)}, piers ${insight.piers.map((p) => p.stability.toFixed(2)).join('/')}: ${JSON.stringify(design)}`;
      }
      if (feasible && insight.safety < 1 - 1e-4) conservative++;
    }
    console.info(`fixture c, 300 random designs: ${unsafe} judged safe with no admissible state of the whole bridge, ${conservative} judged unsafe although one exists${first ? `\n  first: ${first}` : ''}`);
    expect(conservative).toBe(0);
    expect(unsafe).toBe(0);
  });
});

describe('claims of SIM-SPEC sections 10 and 11', () => {
  it('a thicker ring never lowers gsf (fixture d, rise 5 m)', () => {
    const level = FIXTURES.d;
    const rows: string[] = [];
    let worstDrop = 0;
    let last = 0;
    for (let t = 0.4; t <= 1.4 + 1e-9; t += 0.1) {
      const gsf = sim.insight(level, variant(level, (d) => void ((d.spans[0]!.rise = 5), (d.spans[0]!.thickness = t)))).spans[0]!.gsf;
      rows.push(`t ${t.toFixed(1)}: ${gsf.toFixed(2)}`);
      worstDrop = Math.max(worstDrop, (last - gsf) / Math.max(last, 1e-9));
      last = gsf;
    }
    console.info(`gsf against ring thickness, fixture d, rise 5: ${rows.join(', ')}`);
    expect(worstDrop).toBeLessThanOrEqual(1e-6);
  });

  it('on rock nothing is blamed on soft ground (fixture b, rise 6.75 m, ring 0.5 m)', () => {
    const level = FIXTURES.b;
    const design = variant(level, (d) => void ((d.spans[0]!.rise = 6.75), (d.spans[0]!.thickness = 0.5)));
    const run = sim.run(level, design);
    run.advance(level.endYear);
    const collapse = run.summary().collapse;
    console.info(`fixture b (rock abutments), flat thin ring: fell in ${collapse?.year} of '${collapse?.cause}', spread ${(run.state.spans[0]!.spread * 100).toFixed(1)} cm`);
    expect(collapse?.cause).not.toBe('settlement');
  });
});
