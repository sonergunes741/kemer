import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import type { BridgeDesign, LevelDef } from '../core/types';
import { BridgeModel } from './bridge';
import { normalize } from './design';
import { buildLayout } from './geometry';
import { createSim } from './index';
import { solveThrust } from './ring';
import { fixtureC, longBridge } from './testing/fixtures';
import { withSpans } from './testing/helpers';
import { PIER_STABILITY_CAP } from './tuning';

const sim = createSim();

/** A flat 25 m span between two piers, with a tall light span beyond each: the piers are pushed sideways. */
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
const onRock: LevelDef = { ...fixtureC, site: { ...fixtureC.site, soils: [] } };

/** Does the dead-load problem of the whole bridge (every ring, every pier, nothing softened) have a solution? */
function wholeBridgeStands(level: LevelDef, design: BridgeDesign): boolean {
  const model = new BridgeModel(buildLayout(level, design));
  model.assemble(0, model.count - 1, false, false, -1, 1, 0, 0, false);
  return model.solveWindow('thrust', 'cold') === 'optimal';
}

describe('pier stability (SIM-SPEC 6)', () => {
  it('a pier that must slide has a margin below 1, not "no answer", and the bridge falls at the strike', () => {
    const design = normalize(onRock, lopsided);
    const model = new BridgeModel(buildLayout(onRock, design));
    for (const sp of model.spans) expect(solveThrust(model.ws, sp, model.law, 1, 1)).toBe('optimal');
    // With every ring at its least thrust, pier 0 slides: no base width helps, a rougher base would.
    const [left, right] = [model.spans[0]!.thrustState, model.spans[1]!.thrustState];
    expect(model.kappaFor(0, left, right)).toBe(Infinity);
    const needed = model.kappaFor(0, left, right, true);
    expect(needed).toBeGreaterThan(1);
    expect(needed).toBeLessThan(Infinity);

    const insight = sim.insight(onRock, design);
    for (const s of insight.spans) expect(s.gsf).toBeGreaterThan(1);
    for (const p of insight.piers) {
      expect(p.stability).toBeGreaterThan(0);
      expect(p.stability).toBeLessThan(1);
    }
    expect(insight.safety).toBeLessThan(1);
    expect(wholeBridgeStands(onRock, design)).toBe(false);

    const strike = sim.strike(onRock, design);
    expect(strike.stands).toBe(false);
    expect(strike.collapse!.cause).toBe('strike');
    expect(strike.collapse!.piers.length).toBeGreaterThan(0);
    for (const s of strike.collapse!.spans) expect(s.hinges.length).toBeGreaterThanOrEqual(4);
  });

  it('the gauge falls steadily as the thrust on a pier grows more one-sided, through 1, never back to the cap', () => {
    const last = [Infinity, Infinity];
    let crossed = false;
    for (let rise = 7.5; rise >= 3 - 1e-9; rise -= 0.75) {
      const design = normalize(onRock, { ...lopsided, spans: lopsided.spans.map((s, i) => (i === 1 ? { ...s, rise } : s)) });
      const insight = sim.insight(onRock, design);
      for (const s of insight.spans) expect(s.gsf, `rise ${rise}`).toBeGreaterThan(1);
      for (let q = 0; q < 2; q++) {
        const stability = insight.piers[q]!.stability;
        expect(stability, `rise ${rise} pier ${q}`).toBeLessThan(Math.min(PIER_STABILITY_CAP, last[q]!));
        last[q] = stability;
      }
      if (insight.piers[0]!.stability < 1) crossed = true;
      expect(insight.safety >= 1).toBe(wholeBridgeStands(onRock, design));
    }
    expect(crossed).toBe(true);
    expect(last[0]).toBeGreaterThan(0.2);
  });

  it('safe at insight means the whole bridge has a state, and the reverse, on chains of piers', () => {
    // Windows of two and four spans cannot see a whole chain: this is what the final check is for.
    const level = longBridge(6);
    const rng = new Rng(4242);
    let safe = 0;
    let pierFails = 0;
    for (let trial = 0; trial < 80; trial++) {
      const design = normalize(
        level,
        withSpans(level, (x) => {
          x.piers.forEach((p) => {
            p.x += rng.range(-3, 3);
            p.width = rng.range(2, 3.5);
          });
          x.spans.forEach((s) => {
            s.rise = rng.range(1.3, 7);
            s.thickness = rng.range(0.6, 1.2);
            s.fullness = rng.range(0.6, 1);
          });
        }),
      );
      const insight = sim.insight(level, design);
      const stands = wholeBridgeStands(level, design);
      const context = JSON.stringify(design);
      if (insight.safety > 1 + 1e-4) expect(stands, context).toBe(true);
      if (insight.safety < 1 - 1e-4) expect(stands, context).toBe(false);
      expect(sim.strike(level, design).stands, context).toBe(insight.safety >= 1 - 1e-6);
      if (insight.safety >= 1) safe++;
      else if (Math.min(...insight.spans.map((s) => s.gsf)) >= 1) pierFails++;
    }
    expect(safe).toBeGreaterThan(10);
    expect(pierFails).toBeGreaterThan(10);
  });
});
