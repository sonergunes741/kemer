import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import type { BridgeDesign, LevelDef } from '../core/types';
import { createSim } from './index';
import { FIXTURES } from './testing/fixtures';

const sim = createSim();

function randomDesign(level: LevelDef, rng: Rng): BridgeDesign {
  const lim = level.limits;
  const piers = rng.int(lim.minPiers, lim.maxPiers);
  const span = (): BridgeDesign['spans'][number] => ({
    // From too flat to too tall for a typical span of this bridge; normalize clamps the extremes.
    rise: (rng.range(0.05, 0.8) * (level.site.right - level.site.left)) / (piers + 1),
    fullness: rng.chance(0.2) ? rng.pick([0, 1]) : rng.next(),
    thickness: rng.range(lim.thickness[0], lim.thickness[1]),
  });
  return sim.normalize(level, {
    v: 1,
    springLevel: rng.range(level.site.springRange[0], level.site.springRange[1]),
    piers: Array.from({ length: piers }, () => ({ x: rng.range(level.site.pierZone[0], level.site.pierZone[1]), width: rng.range(lim.pierWidth[0], lim.pierWidth[1]) })),
    spans: Array.from({ length: piers + 1 }, span),
    linked: rng.chance(0.3),
    cover: rng.range(lim.cover[0], lim.cover[1]),
    foundation: rng.range(lim.foundation[0], lim.foundation[1]),
    cutwaters: rng.chance(0.5),
    reliefs: rng.chance(0.5),
    clamps: rng.chance(0.5),
    piles: rng.chance(0.5),
  });
}

describe('random designs', () => {
  it.each(Object.entries(FIXTURES))('fixture %s: every answer is finite and consistent', (_, level) => {
    const rng = new Rng(level.site.seed);
    let stood = 0;
    for (let i = 0; i < 40; i++) {
      const d = randomDesign(level, rng);
      const context = JSON.stringify(d);
      const insight = sim.insight(level, d);
      expect(Number.isFinite(insight.safety), context).toBe(true);
      expect(insight.safety).toBeGreaterThanOrEqual(0);
      expect(insight.spans.length).toBe(d.spans.length);
      for (const s of insight.spans) {
        expect(Number.isFinite(s.gsf) && Number.isFinite(s.thrust) && Number.isFinite(s.crushing), context).toBe(true);
        for (const p of s.thrustLine) expect(Number.isFinite(p.x) && Number.isFinite(p.y), context).toBe(true);
        expect(s.gsf).toBeLessThanOrEqual(50);
      }
      for (const p of insight.piers) {
        expect(p.stability).toBeGreaterThanOrEqual(0);
        expect(p.stability).toBeLessThanOrEqual(5);
      }
      expect(insight.safety).toBe(Math.min(...insight.spans.map((s) => s.gsf), ...insight.piers.map((p) => p.stability)));

      const g = sim.geometry(level, d);
      for (const stones of Object.values(g.stones)) expect(Number.isInteger(stones) && stones >= 0, context).toBe(true);
      for (let k = 1; k < g.deck.length; k++) expect(g.deck[k]!.x).toBeGreaterThan(g.deck[k - 1]!.x);
      for (const span of g.spans) {
        expect(span.voussoirs.length % 2).toBe(1);
        // The road never cuts into a ring.
        for (const j of span.joints) {
          const k = g.deck.findIndex((p) => p.x >= j.b.x);
          if (k > 0) {
            const a = g.deck[k - 1]!;
            const b = g.deck[k]!;
            expect(a.y + ((b.y - a.y) * (j.b.x - a.x)) / (b.x - a.x), context).toBeGreaterThanOrEqual(j.b.y - 1e-9);
          }
        }
      }

      const strike = sim.strike(level, d);
      expect(strike.stands).toBe(insight.safety >= 1 - 1e-6);
      if (!strike.stands) {
        expect(strike.collapse!.spans.length + strike.collapse!.piers.length, context).toBeGreaterThan(0);
        continue;
      }
      stood++;
      if (i % 4 !== 0) continue;
      const c = sim.capacities(level, d);
      for (const v of Object.values(c)) expect(Number.isFinite(v) && v >= 0, context).toBe(true);
      const run = sim.run(level, d);
      const events = run.advance(level.endYear);
      const last = events[events.length - 1]!;
      expect(['end', 'collapse'], context).toContain(last.kind);
      expect(run.ended).toBe(true);
      for (const s of run.state.spans) {
        expect(Number.isFinite(s.gsf) && Number.isFinite(s.spread) && Number.isFinite(s.drop) && Number.isFinite(s.jointLoss), context).toBe(true);
        for (const shift of s.shifts) expect(Number.isFinite(shift.dx) && Number.isFinite(shift.dy) && Number.isFinite(shift.rot), context).toBe(true);
      }
      if (last.kind === 'collapse') expect(last.info.spans.length, context).toBeGreaterThan(0);
      const summary = run.summary();
      expect(summary.lastYear).toBeGreaterThanOrEqual(level.year);
      expect(summary.lastYear).toBeLessThanOrEqual(level.endYear);
    }
    // Enough designs must stand for the run checks above to mean something. On fixture c (random
    // pier places, unequal spans) only about one in five has piers that hold the unbalanced thrust.
    expect(stood).toBeGreaterThan(5);
  });
});
