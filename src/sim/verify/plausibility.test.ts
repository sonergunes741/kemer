/**
 * Plausibility survey: a grid of designs on every fixture through full runs, tabulated for a
 * human to read (run with `npx vitest run src/sim/verify/plausibility.test.ts --silent=false`).
 * The assertions only catch the grossly absurd; the table is the product.
 */
import { describe, expect, it } from 'vitest';
import type { BridgeDesign, ChronicleEvent, LevelDef, RunSummary } from '../../core/types';
import { createSim, naturalDischarge } from '../index';
import { FIXTURES } from '../testing/fixtures';

const sim = createSim();

interface Row {
  readonly label: string;
  readonly gsf: number;
  readonly pier: number;
  readonly stands: boolean;
  readonly settle: readonly number[];
  readonly summary: RunSummary;
  /** The same design looked after: repaired every 60 years when a repair is on offer. */
  readonly kept: RunSummary;
  readonly maxLevel: number;
  readonly maxAfflux: number;
  readonly maxVelocity: number;
  readonly maxScour: number;
  readonly loss: number;
  readonly spread: number;
  readonly text: string;
}

function survey(level: LevelDef, design: BridgeDesign, label: string): Row {
  const nd = sim.normalize(level, design);
  const insight = sim.insight(level, nd);
  const capacities = sim.capacities(level, nd);
  const strike = sim.strike(level, nd);
  const run = sim.run(level, nd);
  const events: ChronicleEvent[] = run.advance(level.endYear);
  const summary = run.summary();
  const caretaker = sim.run(level, nd);
  for (let year = level.year + 60; !caretaker.ended; year += 60) {
    caretaker.advance(year);
    if (!caretaker.ended) caretaker.repair();
  }
  const kept = caretaker.summary();
  let maxLevel = 0;
  let maxAfflux = 0;
  let maxVelocity = 0;
  let maxScour = 0;
  for (const e of events) {
    if (e.kind !== 'flood') continue;
    maxLevel = Math.max(maxLevel, e.level);
    maxAfflux = Math.max(maxAfflux, e.level - e.stage);
    maxVelocity = Math.max(maxVelocity, e.velocity);
    for (const x of e.scour) maxScour = Math.max(maxScour, x);
  }
  const gsf = Math.min(...insight.spans.map((s) => s.gsf));
  const pier = insight.piers.length > 0 ? Math.min(...insight.piers.map((p) => p.stability)) : NaN;
  const loss = Math.max(...run.state.spans.map((s) => s.jointLoss));
  const spread = Math.max(...run.state.spans.map((s) => s.spread));
  const seals = (s: RunSummary): string => `${s.seals.standing ? 'S' : '-'}${s.seals.lean ? 'L' : '-'}${s.seals.unrepaired ? 'U' : '-'}`;
  const text = [
    label.padEnd(26),
    `gsf ${gsf.toFixed(2)}`.padEnd(10),
    `pier ${Number.isNaN(pier) ? '-' : pier.toFixed(2)}`.padEnd(10),
    (strike.stands ? `settles ${(Math.max(...strike.settle) * 100).toFixed(1)} cm` : `FALLS (${strike.collapse?.cause})`).padEnd(18),
    `axle ${capacities.axle.toFixed(0)} kN`.padEnd(14),
    `quake ${capacities.quake.toFixed(2)} g`.padEnd(13),
    `stones ${summary.stones}`.padEnd(13),
    `alone: ${summary.lastYear} ${summary.collapse ? summary.collapse.cause : 'stands'}`.padEnd(26),
    seals(summary),
    `| kept: ${kept.lastYear} ${kept.collapse ? kept.collapse.cause : 'stands'}`.padEnd(26),
    `${seals(kept)} ${kept.repairs} repairs ${kept.stones} stones`.padEnd(30),
    `| flood ${maxLevel.toFixed(1)} m (+${maxAfflux.toFixed(1)}) ${maxVelocity.toFixed(1)} m/s scour ${maxScour.toFixed(2)} m, joints -${(loss * 100).toFixed(0)} cm, spread ${(spread * 100).toFixed(0)} cm`,
  ].join(' ');
  return { label, gsf, pier, stands: strike.stands, settle: strike.settle, summary, kept, maxLevel, maxAfflux, maxVelocity, maxScour, loss, spread, text };
}

function grid(level: LevelDef, pierCounts: readonly number[]): Row[] {
  const rows: Row[] = [survey(level, level.starter, 'starter')];
  const [t0, t1] = level.limits.thickness;
  const length = level.site.right - level.site.left;
  for (const np of pierCounts) {
    for (const riseRatio of [0.12, 0.25, 0.4, 0.5, 0.8]) {
      for (const share of [0, 0.25, 0.5, 1]) {
        const design = JSON.parse(JSON.stringify(level.starter)) as BridgeDesign;
        const width = design.piers[0]?.width ?? level.limits.pierWidth[0];
        const clear = (length - np * width) / (np + 1);
        const thickness = t0 + share * (t1 - t0);
        design.piers = Array.from({ length: np }, (_, i) => ({ x: level.site.left + (length * (i + 1)) / (np + 1), width }));
        design.spans = Array.from({ length: np + 1 }, () => ({ rise: riseRatio * clear, fullness: design.spans[0]!.fullness, thickness }));
        rows.push(survey(level, design, `${np} piers, f/s ${riseRatio}, t ${thickness.toFixed(2)}`));
      }
    }
  }
  return rows;
}

const PIERS: Readonly<Record<'a' | 'b' | 'c' | 'd', readonly number[]>> = { a: [0], b: [0], c: [2, 3, 4], d: [0, 1] };
const tables = new Map<string, Row[]>();
const rowsOf = (key: 'a' | 'b' | 'c' | 'd'): Row[] => {
  let rows = tables.get(key);
  if (!rows) tables.set(key, (rows = grid(FIXTURES[key], PIERS[key])));
  return rows;
};

describe.each(['a', 'b', 'c', 'd'] as const)('plausibility, fixture %s', (key) => {
  const level = FIXTURES[key];

  it('prints the survey and stays inside physical bounds', () => {
    const rows = rowsOf(key);
    const greatest = sim.greatestFlood(level);
    const causes = new Map<string, number>();
    for (const r of rows) {
      const cause = r.summary.collapse ? r.summary.collapse.cause : 'stands';
      causes.set(cause, (causes.get(cause) ?? 0) + 1);
    }
    const count = (pick: (r: Row) => boolean): number => rows.filter(pick).length;
    console.info(
      [
        `== fixture ${key}: built ${level.year}, ${level.stone}, greatest flood ${greatest.year} at ${greatest.stage.toFixed(2)} m (2-year ${sim.floodStage(level, 2).toFixed(2)}, 100-year ${sim.floodStage(level, 100).toFixed(2)}, 1000-year ${sim.floodStage(level, 1000).toFixed(2)})`,
        ...rows.map((r) => r.text),
        `-- ${rows.length} designs: ${count((r) => r.stands)} stand at strike; left alone: ${[...causes].map(([c, n]) => `${c} ${n}`).join(', ')}; seals alone: standing ${count((r) => r.summary.seals.standing)}, lean ${count((r) => r.summary.seals.lean)}, unrepaired ${count((r) => r.summary.seals.unrepaired)}, masterwork ${count((r) => r.summary.masterwork)}`,
        `-- repaired every 60 years: standing ${count((r) => r.kept.seals.standing)}, lean ${count((r) => r.kept.seals.lean)}, passed ${count((r) => r.kept.passed)} (alone: ${count((r) => r.summary.passed)})`,
      ].join('\n'),
    );
    // Neither everything nor nothing may stand at strike, and floods must stay physical.
    expect(count((r) => r.stands)).toBeGreaterThan(0);
    expect(count((r) => !r.stands)).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.maxVelocity).toBeLessThan(10);
      expect(r.maxAfflux).toBeLessThan(5);
      // HEC-18 caps the hole at 2.4 pier widths (5 m piers at most on these fixtures).
      expect(r.maxScour).toBeLessThanOrEqual(2.4 * 5 * 1.5);
      for (const s of r.settle) expect(s).toBeLessThan(1);
    }
  }, 300000);

  it('care is never worse than neglect', () => {
    for (const r of rowsOf(key)) expect(r.kept.lastYear).toBeGreaterThanOrEqual(r.summary.lastYear);
  }, 300000);
});

describe('plausibility, particular expectations', () => {
  it('the 7 m village arch settles about a centimetre when the centering is struck (SIM-SPEC 7)', () => {
    const settle = sim.strike(FIXTURES.a, FIXTURES.a.starter).settle[0]!;
    console.info(`fixture a starter settles ${(settle * 100).toFixed(2)} cm`);
    expect(settle).toBeGreaterThan(0.005);
    expect(settle).toBeLessThan(0.02);
  });

  it('Manning discharge of the natural channel, worked out by hand from the ground line', () => {
    for (const key of ['a', 'b', 'c', 'd'] as const) {
      const level = FIXTURES[key];
      const site = level.site;
      const h = sim.floodStage(level, 100);
      // Wet area and wetted perimeter: every piece of the ground line below the water.
      let area = 0;
      let perimeter = 0;
      for (let i = 1; i < site.ground.length; i++) {
        const p = site.ground[i - 1]!;
        const q = site.ground[i]!;
        if (p.y >= h && q.y >= h) continue;
        // Clip the segment to its part under water.
        const t0 = p.y > h ? (p.y - h) / (p.y - q.y) : 0;
        const t1 = q.y > h ? (h - p.y) / (q.y - p.y) : 1;
        const y0 = p.y + (q.y - p.y) * t0;
        const y1 = p.y + (q.y - p.y) * t1;
        const dx = (q.x - p.x) * (t1 - t0);
        area += ((h - y0 + (h - y1)) / 2) * dx;
        perimeter += Math.hypot(dx, y1 - y0);
      }
      const discharge = (area * Math.pow(area / perimeter, 2 / 3) * Math.sqrt(site.slope)) / site.manningN;
      const run = sim.run(level, level.starter);
      const flood = run.advance(level.endYear).find((e) => e.kind === 'flood');
      console.info(
        `fixture ${key}, 100-year stage ${h.toFixed(2)} m: by hand area ${area.toFixed(1)} m2, perimeter ${perimeter.toFixed(1)} m, velocity ${(discharge / area).toFixed(2)} m/s, discharge ${discharge.toFixed(0)} m3/s` +
          (flood && flood.kind === 'flood' ? `; first reported flood of the starter: stage ${flood.stage.toFixed(2)} m, upstream ${flood.level.toFixed(2)} m, ${flood.velocity.toFixed(2)} m/s through the openings` : ''),
      );
      const simulated = naturalDischarge(level, h);
      console.info(`  simulation: ${simulated.toFixed(0)} m3/s`);
      // The simulation keeps the running maximum over the stage (a floodplain that has just wetted
      // lowers the single-section Manning value), so it may sit a little above the hand figure.
      expect(simulated).toBeGreaterThan(0.99 * discharge);
      expect(simulated).toBeLessThan(1.25 * discharge);
      // A plausible river: between a brisk walk and a torrent.
      expect(discharge / area).toBeGreaterThan(0.5);
      expect(discharge / area).toBeLessThan(8);
    }
  });

  it('every cause of collapse occurs somewhere on the fixtures', () => {
    const seen = new Set<string>();
    for (const key of ['a', 'b', 'c', 'd'] as const) for (const r of rowsOf(key)) if (r.summary.collapse) seen.add(r.summary.collapse.cause);
    console.info(`causes seen: ${[...seen].sort().join(', ')}`);
    for (const cause of ['strike', 'weathering', 'flood-scour', 'flood-wash', 'quake', 'load', 'settlement', 'crushing']) expect(seen.has(cause)).toBe(true);
  }, 300000);

  it('on fixture a some design left alone outlives the greatest flood (the unrepaired seal can be earned)', () => {
    // The whole design space of fixture a: rise and ring thickness.
    const level = FIXTURES.a;
    let best = { year: 0, label: '' };
    let earned = 0;
    for (let rise = 0.7; rise <= 7 + 1e-9; rise += 0.35) {
      for (let t = 0.25; t <= 0.9 + 1e-9; t += 0.05) {
        const design = JSON.parse(JSON.stringify(level.starter)) as BridgeDesign;
        design.spans[0]!.rise = rise;
        design.spans[0]!.thickness = t;
        const run = sim.run(level, design);
        run.advance(level.endYear);
        const s = run.summary();
        if (s.seals.unrepaired) earned++;
        if (s.lastYear > best.year) best = { year: s.lastYear, label: `rise ${rise.toFixed(2)}, ring ${t.toFixed(2)}: ${s.collapse?.cause ?? 'stands'}` };
      }
    }
    console.info(`fixture a, 266 designs left alone: the longest-lived falls in ${best.year} (${best.label}); the greatest flood is in ${sim.greatestFlood(level).year}; unrepaired seal earned by ${earned}`);
    expect(earned).toBeGreaterThan(0);
  }, 300000);
});
