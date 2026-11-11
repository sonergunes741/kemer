/**
 * Timing of the calls the game makes most: insight() on every pointer move, capacities() on
 * release, a full run, and single advance() calls during the time-lapse. Numbers are logged
 * (`--silent=false`); the assertions are loose so a busy machine does not fail the suite.
 */
import { describe, expect, it } from 'vitest';
import type { BridgeDesign, LevelDef } from '../../core/types';
import { createSim } from '../index';
import { FIXTURES, longBridge } from '../testing/fixtures';

const sim = createSim();

function stats(samples: number[]): { median: number; p95: number; max: number; text: string } {
  const s = samples.slice().sort((a, b) => a - b);
  const at = (q: number): number => s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
  const r = { median: at(0.5), p95: at(0.95), max: s[s.length - 1]! };
  return { ...r, text: `median ${r.median.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms, worst ${r.max.toFixed(2)} ms` };
}

/** A design no cache has seen: the starter with every span nudged by a different amount. */
function fresh(level: LevelDef, i: number): BridgeDesign {
  const d = JSON.parse(JSON.stringify(level.starter)) as BridgeDesign;
  d.linked = false;
  d.spans.forEach((s, k) => {
    s.thickness += 0.0007 * (i + 1) + 0.0001 * k;
    s.rise += 0.0011 * (i + 1);
  });
  return d;
}

const LEVELS: readonly (readonly [string, LevelDef])[] = [
  ['a', FIXTURES.a],
  ['b', FIXTURES.b],
  ['c', FIXTURES.c],
  ['d', FIXTURES.d],
  ['ten spans', longBridge(10)],
];

describe('performance', () => {
  it.each(LEVELS)('insight, %s: a different design on every call', (name, level) => {
    for (let i = 0; i < 30; i++) sim.insight(level, fresh(level, 10000 + i));
    const times: number[] = [];
    for (let i = 0; i < 300; i++) {
      const d = fresh(level, i);
      const t0 = performance.now();
      sim.insight(level, d);
      times.push(performance.now() - t0);
    }
    const s = stats(times);
    console.info(`insight, ${name} (${level.starter.spans.length} spans): ${s.text}`);
    expect(s.median).toBeLessThan(12);
  });

  it.each(LEVELS)('capacities and a full run, %s', (name, level) => {
    const capacities: number[] = [];
    const runs: number[] = [];
    const worstStep: number[] = [];
    const worstCold: number[] = [];
    for (let i = 0; i < 12; i++) {
      const d = fresh(level, 500 + i);
      sim.insight(level, d);
      let t0 = performance.now();
      sim.capacities(level, d);
      capacities.push(performance.now() - t0);
      t0 = performance.now();
      const run = sim.run(level, d);
      run.advance(level.endYear);
      runs.push(performance.now() - t0);
      // The time-lapse: one advance per year, what is the longest single call? First for a design
      // whose capacities() the game has already asked for (the usual case), then for one it has not.
      for (const [list, warmed] of [
        [worstStep, true],
        [worstCold, false],
      ] as const) {
        const design = fresh(level, (warmed ? 900 : 1300) + i);
        if (warmed) sim.capacities(level, design);
        const stepped = sim.run(level, design);
        let worst = 0;
        for (let year = level.year + 1; !stepped.ended; year++) {
          t0 = performance.now();
          stepped.advance(year);
          worst = Math.max(worst, performance.now() - t0);
        }
        list.push(worst);
      }
    }
    console.info(
      `${name}: capacities ${stats(capacities).text}; full run ${stats(runs).text}; longest single one-year advance() ${stats(worstStep).text} (without a prior capacities(): ${stats(worstCold).text})`,
    );
    expect(stats(runs).median).toBeLessThan(2000);
  }, 120000);
});
