import { describe, expect, it } from 'vitest';
import type { ChronicleEvent, LevelDef } from '../core/types';
import { analysisOf } from './analysis';
import { BridgeModel } from './bridge';
import { collapseFrom } from './collapse';
import { normalize } from './design';
import { buildLayout } from './geometry';
import { createSim } from './index';
import { FIXTURES, fixtureA, fixtureB, fixtureC, fixtureD, longBridge } from './testing/fixtures';
import { clone, withSpans } from './testing/helpers';
import { REPAIR_MIN_STONES } from './tuning';

const sim = createSim();
const levels = Object.values(FIXTURES);

describe('the whole bridge', () => {
  it('a wider pier is never less stable, and unequal spans load the pier between them', () => {
    let last = 0;
    for (const width of [2, 3, 4, 5]) {
      const d = withSpans(fixtureC, (x) => x.piers.forEach((p) => (p.width = width)));
      const stability = Math.min(...sim.insight(fixtureC, d).piers.map((p) => p.stability));
      expect(stability).toBeGreaterThanOrEqual(last - 1e-6);
      last = stability;
    }
    const even = sim.insight(fixtureC, fixtureC.starter);
    const uneven = sim.insight(
      fixtureC,
      withSpans(fixtureC, (x) => {
        x.piers[0]!.x = 9;
        x.linked = false;
      }),
    );
    expect(uneven.piers[0]!.stability).toBeLessThan(even.piers[0]!.stability);
  });

  it('a ring too thin to stand falls when the centering is struck, with its mechanism', () => {
    const level: LevelDef = { ...fixtureB, limits: { ...fixtureB.limits, thickness: [0.15, 1.8] } };
    const thin = withSpans(level, (x) => {
      x.spans[0]!.thickness = 0.16;
      x.spans[0]!.fullness = 0.2;
    });
    const insight = sim.insight(level, thin);
    expect(insight.safety).toBeLessThan(1);
    const strike = sim.strike(level, thin);
    expect(strike.stands).toBe(false);
    expect(strike.collapse!.cause).toBe('strike');
    expect(strike.collapse!.year).toBe(level.year);
    expect(strike.collapse!.spans[0]!.hinges.length).toBeGreaterThanOrEqual(4);
    // Its chronicle is over before it starts: the first advance() reports that collapse, once.
    const run = sim.run(level, thin);
    expect(run.ended).toBe(true);
    expect(run.advance(level.endYear)).toEqual([{ kind: 'collapse', year: level.year, info: strike.collapse }]);
    expect(run.advance(level.endYear)).toEqual([]);
    expect(run.summary().passed).toBe(false);
    expect(run.summary().collapse!.cause).toBe('strike');
  });

  it('stone too weak for the load fails by crushing', () => {
    const weak: LevelDef = { ...fixtureB, stone: 'tuff', limits: { ...fixtureB.limits, thickness: [0.15, 1.8] } };
    const d = withSpans(weak, (x) => {
      x.spans[0]!.thickness = 0.45;
      x.spans[0]!.rise = 5;
      x.cover = 1.5;
    });
    const strike = sim.strike(weak, d);
    expect(strike.stands).toBe(false);
    expect(strike.collapse!.cause).toBe('crushing');
    // The same ring in basalt carries it.
    expect(sim.strike({ ...weak, stone: 'basalt' }, d).stands).toBe(true);
  });

  it('collapse runs on through piers that cannot hold a one-sided thrust', () => {
    // Slender, tall piers on rock: remove one span and the rest follows, one step later each.
    const level = longBridge(5);
    const d = withSpans(level, (x) => {
      x.piers.forEach((p) => (p.width = 2));
      x.spans.forEach((sp) => (sp.rise = 2));
      x.springLevel = 2.5;
    });
    const model = new BridgeModel(buildLayout(level, normalize(level, d)));
    const fall = collapseFrom(model, { spans: new Map([[0, []]]), piers: [] });
    expect(fall.spans.map((s) => s.span)).toEqual([0, 1, 2, 3, 4]);
    expect(fall.piers).toEqual([0, 1, 2, 3]);
    for (let i = 1; i < fall.spans.length; i++) expect(fall.spans[i]!.delay).toBeCloseTo(0.6 * i, 9);
    expect(fall.spans[1]!.hinges.length).toBeGreaterThanOrEqual(3);
    // Stout piers stop it at once.
    const stout = new BridgeModel(buildLayout(level, normalize(level, withSpans(level, (x) => x.piers.forEach((p) => (p.width = 5))))));
    expect(collapseFrom(stout, { spans: new Map([[0, []]]), piers: [] }).spans.length).toBe(1);
  });
});

describe('the chronicle', () => {
  it('runs every fixture to an end and reports it consistently', () => {
    for (const level of levels) {
      const run = sim.run(level, level.starter);
      expect(run.year).toBe(level.year);
      const upcoming = run.upcoming(100);
      for (let i = 1; i < upcoming.length; i++) expect(upcoming[i]!.year).toBeGreaterThanOrEqual(upcoming[i - 1]!.year);
      for (const hz of level.hazards) expect(upcoming.some((u) => u.year === hz.year && u.kind === hz.kind && u.drama >= 0.7)).toBe(true);
      const events: ChronicleEvent[] = [];
      for (let y = level.year + 1; !run.ended; y += 1) {
        events.push(...run.advance(y));
        for (const u of run.upcoming(3)) expect(u.year).toBeGreaterThan(run.year);
      }
      const last = events[events.length - 1]!;
      const summary = run.summary();
      expect(['end', 'collapse']).toContain(last.kind);
      for (let i = 1; i < events.length; i++) expect(events[i]!.year).toBeGreaterThanOrEqual(events[i - 1]!.year);
      expect(summary.years).toBe(summary.lastYear - level.year);
      expect(summary.passed).toBe(summary.years >= level.passYears);
      expect(summary.seals.standing).toBe(last.kind === 'end');
      if (last.kind === 'collapse') {
        expect(run.state.collapsed).toBe(true);
        expect(summary.collapse).toEqual(last.info);
        expect(last.info.spans.length).toBeGreaterThan(0);
        expect(summary.lastYear).toBe(last.year);
      }
      expect(events.filter((e) => e.kind === 'century').length).toBe(Math.floor(summary.lastYear / 100) - Math.floor(level.year / 100));
      expect(run.advance(level.endYear + 50)).toEqual([]);
      console.info(`${level.id}: starter unrepaired stands until ${summary.lastYear}${summary.collapse ? ` (${summary.collapse.cause})` : ''}`);
    }
  });

  it('weathering wears an unrepaired ring down and repairs keep it standing', () => {
    const neglected = sim.run(fixtureA, fixtureA.starter);
    neglected.advance(fixtureA.endYear);
    const summary = neglected.summary();
    expect(summary.collapse?.cause).toBe('weathering');
    expect(summary.passed).toBe(true);

    const kept = sim.run(fixtureA, fixtureA.starter);
    expect(kept.quote().possible).toBe(false);
    expect(kept.repair()).toBe(false);
    let repairStones = 0;
    for (let y = fixtureA.year + 50; y <= fixtureA.endYear; y += 50) {
      kept.advance(y);
      const lossBefore = kept.state.spans[0]!.jointLoss;
      const quote = kept.quote();
      expect(quote.possible).toBe(true);
      // Repointing fifty years of weathering is a few in a hundred stones, not a rebuild.
      expect(quote.stones).toBeGreaterThan(0.01 * kept.geometry.stones.total);
      expect(quote.stones).toBeLessThan(0.06 * kept.geometry.stones.total);
      expect(kept.repair()).toBe(true);
      repairStones += quote.stones;
      expect(kept.state.spans[0]!.jointLoss).toBeCloseTo(lossBefore * 0.1, 12);
      expect(kept.state.growth).toBe(0);
    }
    kept.advance(fixtureA.endYear);
    const s = kept.summary();
    expect(s.seals.standing).toBe(true);
    expect(s.seals.unrepaired).toBe(false);
    expect(s.stones).toBe(kept.geometry.stones.total + repairStones);
    expect(s.repairs).toBe(kept.state.repairs);
    expect(s.masterwork).toBe(false);
  });

  it('a repair costs the work it does', () => {
    const early = sim.run(fixtureA, fixtureA.starter);
    const late = sim.run(fixtureA, fixtureA.starter);
    early.advance(fixtureA.year + 30);
    late.advance(fixtureA.year + 200);
    const small = early.quote().stones;
    const large = late.quote().stones;
    // More joint depth to restore, more stones; a little work costs the minimum.
    expect(small).toBe(REPAIR_MIN_STONES);
    expect(large).toBeGreaterThan(2 * small);
    // Right after a repair there is little left to do.
    expect(late.repair()).toBe(true);
    late.advance(late.year + 5);
    expect(late.quote().stones).toBe(REPAIR_MIN_STONES);
  });

  it('yielding clay banks spread the arch, and piles hold them', () => {
    const plain = sim.run(fixtureD, fixtureD.starter);
    const piled = sim.run(fixtureD, { ...clone(fixtureD.starter), piles: true });
    plain.advance(1800);
    piled.advance(1800);
    expect(plain.state.spans[0]!.spread).toBeGreaterThan(0.2);
    expect(piled.state.spans[0]!.spread).toBeLessThan(0.4 * plain.state.spans[0]!.spread);
    expect(plain.state.spans[0]!.hinges.length).toBe(3);
    expect(plain.state.spans[0]!.shifts.some((s) => Math.abs(s.dy) > 0.01)).toBe(true);
    expect(plain.state.spans[0]!.gsf).toBeLessThan(piled.state.spans[0]!.gsf);
  });

  it('only ground that moved is blamed for a collapse: never on rock, on clay when the banks yield', () => {
    // Rock banks, no piers: whatever opens these rings (a worn ring under everyday carts, an
    // earthquake it survived) is damage, not soft ground.
    for (const level of [fixtureA, fixtureB]) {
      const [lo, hi] = level.limits.thickness;
      const length = level.site.right - level.site.left;
      const causes = new Set<string>();
      for (const rise of [0.15, 0.25, 0.35, 0.5, 0.8]) {
        for (let i = 0; i <= 4; i++) {
          const run = sim.run(
            level,
            withSpans(level, (x) => {
              x.spans[0]!.rise = rise * length;
              x.spans[0]!.thickness = lo + ((hi - lo) * i) / 4;
            }),
          );
          run.advance(level.endYear);
          const cause = run.summary().collapse?.cause;
          if (cause) causes.add(cause);
          expect(cause, `${level.id} rise ${rise} step ${i}`).not.toBe('settlement');
          expect(cause, `${level.id} rise ${rise} step ${i}`).not.toBe('flood-scour');
        }
      }
      expect(causes.has('weathering')).toBe(true);
    }
    // The case the review found: a flat thin ring over the gorge, opened by carts once it had worn.
    const worn = sim.run(
      fixtureB,
      withSpans(fixtureB, (x) => {
        x.spans[0]!.rise = 6.75;
        x.spans[0]!.thickness = 0.5;
      }),
    );
    worn.advance(fixtureB.endYear);
    expect(worn.state.spans[0]!.spread).toBeGreaterThan(0.01);
    expect(worn.summary().collapse!.cause).toBe('weathering');

    // Clay banks that give way under a flat arch are what `settlement` is for.
    const flat = sim.run(fixtureD, withSpans(fixtureD, (x) => void (x.spans[0]!.rise = 2.5)));
    flat.advance(fixtureD.endYear);
    expect(flat.summary().collapse!.cause).toBe('settlement');
  });

  it('everyday traffic too heavy for the bridge from the start is the load; the same carts on a worn bridge are not', () => {
    const capacity = sim.capacities(fixtureA, fixtureA.starter).axle;
    const fate = (share: number): string | undefined => {
      const level: LevelDef = { ...fixtureA, traffic: fixtureA.traffic.map((era) => ({ ...era, axle: share * capacity })) };
      const run = sim.run(level, level.starter);
      run.advance(level.endYear);
      const collapse = run.summary().collapse;
      // No hazard is named: it was an ordinary day.
      expect(collapse?.hazard).toBeUndefined();
      return collapse?.cause;
    };
    expect(fate(0.7)).toBe('load');
    expect(fate(0.5)).toBe('weathering');
  });

  it('run() does the slow preparation, so no advance() pays for it', () => {
    const level = longBridge(6);
    const design = withSpans(level, (x) => void (x.spans[0]!.rise = 4.37));
    const analysis = analysisOf(level, normalize(level, design));
    expect(analysis.axleSpots.length).toBe(0);
    sim.run(level, design);
    expect(analysis.axleSpots.length).toBe(6);
  });

  it('a shallow foundation in gravel is undermined; a deep one with cutwaters is not', () => {
    const shallow = sim.run(fixtureC, withSpans(fixtureC, (x) => ((x.foundation = 1.5), (x.cutwaters = false))));
    const events = shallow.advance(fixtureC.endYear);
    const fell = events[events.length - 1]!;
    expect(fell.kind).toBe('collapse');
    if (fell.kind === 'collapse') {
      expect(fell.info.cause).toBe('flood-scour');
      expect(fell.info.piers.length).toBeGreaterThan(0);
      expect(events[events.length - 2]!.kind).toBe('flood');
    }
    const deep = sim.run(fixtureC, withSpans(fixtureC, (x) => (x.foundation = 5)));
    deep.advance(1500);
    expect(deep.state.collapsed).toBe(false);
    expect(Math.max(...deep.state.piers.map((p) => p.scour))).toBeGreaterThan(0.5);
    expect(Math.max(...deep.state.piers.map((p) => p.settlement))).toBe(0);
  });

  it('an earthquake beyond capacity brings the bridge down, with the hazard named', () => {
    const run = sim.run(fixtureB, fixtureB.starter);
    const events = run.advance(fixtureB.endYear);
    const quake = events.find((e) => e.kind === 'quake');
    const last = events[events.length - 1]!;
    expect(quake).toBeDefined();
    expect(last.kind).toBe('collapse');
    if (last.kind === 'collapse' && quake?.kind === 'quake') {
      expect(last.info.cause).toBe('quake');
      expect(last.info.hazard).toBe(quake.hazard);
      expect(0.6 * quake.pga).toBeGreaterThanOrEqual(quake.capacity);
      expect(last.info.spans[0]!.hinges.length).toBeGreaterThanOrEqual(4);
    }
    // Clamps are there for exactly this.
    const clamped = sim.capacities(fixtureB, { ...clone(fixtureB.starter), clamps: true });
    expect(clamped.quake).toBeGreaterThan(sim.capacities(fixtureB, fixtureB.starter).quake * 1.2);
  });
});

describe('performance', () => {
  it('insight for a ten-span bridge with about forty courses per span', () => {
    const level = longBridge(10);
    const fresh = createSim();
    const times: number[] = [];
    let courses = 0;
    for (let i = 0; i < 80; i++) {
      // A different design every time (the cache must not help), spans all unlike each other.
      const d = clone(level.starter);
      d.spans.forEach((s, k) => {
        s.rise = 4.6 + 0.12 * ((k * 7 + i) % 10);
        s.thickness = 0.7 + 0.01 * ((k * 3 + i) % 9);
      });
      d.piers[i % 9]!.width = 3 + 0.02 * (i % 13);
      const t0 = performance.now();
      const insight = fresh.insight(level, d);
      times.push(performance.now() - t0);
      expect(insight.spans.length).toBe(10);
      courses = insight.spans[0]!.thrustLine.length - 1;
    }
    const warm = times.slice(20).sort((a, b) => a - b);
    const median = warm[Math.floor(warm.length / 2)]!;
    console.info(`insight, 10 spans x ${courses} courses: median ${median.toFixed(2)} ms, best ${warm[0]!.toFixed(2)} ms, worst ${warm[warm.length - 1]!.toFixed(2)} ms (target < 4 ms)`);
    expect(median).toBeLessThan(25);
  });
});
