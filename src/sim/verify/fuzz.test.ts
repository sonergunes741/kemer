/**
 * Seeded fuzz of the public API (SIM-SPEC 12): random and hostile designs on every fixture.
 * Nothing may throw, no NaN or Infinity may come out, runs must be deterministic whatever the
 * call order, and advancing in one step must equal advancing in many.
 */
import { describe, expect, it } from 'vitest';
import type { ChronicleRun } from '../../core/contracts';
import { Rng } from '../../core/rng';
import type { BridgeDesign, ChronicleEvent, LevelDef } from '../../core/types';
import { analysisOf } from '../analysis';
import { Run } from '../chronicle';
import { normalize } from '../design';
import { createSim } from '../index';
import { FIXTURES } from '../testing/fixtures';

const sim = createSim();
const KEYS = ['a', 'b', 'c', 'd'] as const;
const NASTY: readonly number[] = [NaN, 0, -0, -1, 1e-9, 1e9, -1e9, Infinity, -Infinity, Number.MAX_VALUE, Number.MIN_VALUE];

/** A design that may be anything from sensible to hostile. Deliberately escapes the types. */
function wild(rng: Rng, level: LevelDef): BridgeDesign {
  const lim = level.limits;
  const site = level.site;
  const length = site.right - site.left;
  const mode = rng.int(0, 9);
  const maybe = (value: number, p: number): number => (rng.chance(p) ? rng.pick(NASTY) : value);
  const hostile = mode >= 7 ? 0.35 : mode >= 5 ? 0.08 : 0;
  const stretch = mode >= 3 ? 1.6 : 1;
  const within = (range: readonly [number, number]): number => {
    const mid = (range[0] + range[1]) / 2;
    const half = ((range[1] - range[0]) / 2) * stretch;
    return rng.range(mid - half, mid + half + 1e-9);
  };
  let count = rng.int(Math.max(0, lim.minPiers - 1), lim.maxPiers + 1);
  if (mode === 8) count = 12;
  const piers = Array.from({ length: count }, () => ({ x: maybe(site.left + rng.range(-0.1, 1.1) * length, hostile), width: maybe(within(lim.pierWidth), hostile) }));
  if (mode === 4) piers.sort((p, q) => q.x - p.x);
  if (mode === 6 && piers.length > 1) piers[1]!.x = piers[0]!.x;
  const spanCount = mode === 9 ? rng.int(0, count + 3) : count + 1;
  const spans = Array.from({ length: spanCount }, () => ({
    rise: maybe(rng.range(0.02, 1.3) * (length / (count + 1)), hostile),
    fullness: maybe(rng.range(-0.2, 1.2), hostile),
    thickness: maybe(within(lim.thickness), hostile),
  }));
  const design: BridgeDesign = {
    v: 1,
    springLevel: maybe(within(site.springRange), hostile),
    piers,
    spans,
    linked: rng.chance(0.5),
    cover: maybe(within(lim.cover), hostile),
    foundation: maybe(within(lim.foundation), hostile),
    cutwaters: rng.chance(0.5),
    reliefs: rng.chance(0.5),
    clamps: rng.chance(0.5),
    piles: rng.chance(0.5),
  };
  if (mode === 9) {
    // Broken shapes a save file or a careless caller could hand over.
    const broken = design as unknown as Record<string, unknown>;
    const what = rng.int(0, 5);
    if (what === 0) broken.piers = null;
    if (what === 1) broken.spans = undefined;
    if (what === 2) broken.spans = [null, undefined, {}];
    if (what === 3) broken.piers = [null, { x: 'left', width: {} }];
    if (what === 4) broken.cover = '0.5';
    if (what === 5) broken.linked = 1;
  }
  return design;
}

/** Paths of every number that is not finite, anywhere inside a value. */
function nonFinite(value: unknown, path: string, out: string[], depth = 0): string[] {
  if (out.length >= 5 || depth > 12) return out;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(`${path} = ${value}`);
  } else if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const list = value as ArrayLike<unknown>;
    for (let i = 0; i < list.length && out.length < 5; i++) nonFinite(list[i], `${path}[${i}]`, out, depth + 1);
  } else if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) nonFinite((value as Record<string, unknown>)[key], `${path}.${key}`, out, depth + 1);
  }
  return out;
}

function attempt<T>(problems: string[], what: string, run: () => T): T | undefined {
  try {
    return run();
  } catch (error) {
    problems.push(`${what} threw: ${String(error)}`);
    return undefined;
  }
}

describe.each(KEYS)('fuzz, fixture %s', (key) => {
  const level = FIXTURES[key];

  it('normalize, validate, geometry, insight, capacities and strike never throw and return finite numbers (120 designs)', () => {
    const rng = new Rng(0x5eed0 + key.charCodeAt(0));
    const problems: string[] = [];
    const unclean = new Map<string, number>();
    for (let trial = 0; trial < 120; trial++) {
      const raw = wild(rng, level);
      const tag = `${key}#${trial}`;
      const before = problems.length;
      const n = attempt(problems, `${tag} normalize`, () => sim.normalize(level, raw));
      if (!n) continue;
      nonFinite(n, `${tag} normalize`, problems);
      if (n.spans.length !== n.piers.length + 1) problems.push(`${tag} normalize: ${n.spans.length} spans for ${n.piers.length} piers`);
      const again = sim.normalize(level, n);
      if (JSON.stringify(again) !== JSON.stringify(n)) problems.push(`${tag} normalize is not idempotent`);
      attempt(problems, `${tag} validate(raw)`, () => sim.validate(level, raw));
      for (const issue of attempt(problems, `${tag} validate(normalized)`, () => sim.validate(level, n)) ?? []) {
        if (issue.code !== 'deck-too-steep') unclean.set(issue.code, (unclean.get(issue.code) ?? 0) + 1);
      }
      // The public functions catch and fall back to the starter design; go underneath them too so
      // a hidden exception (and an answer for the wrong bridge) cannot pass unnoticed.
      const analysis = attempt(problems, `${tag} analysis (internal)`, () => analysisOf(level, normalize(level, raw)));
      if (analysis) {
        attempt(problems, `${tag} capacities (internal)`, () => analysis.capacities());
        attempt(problems, `${tag} strike (internal)`, () => analysis.strike());
        attempt(problems, `${tag} geometry (internal)`, () => analysis.geometry());
      }
      const geometry = attempt(problems, `${tag} geometry`, () => sim.geometry(level, raw));
      const insight = attempt(problems, `${tag} insight`, () => sim.insight(level, raw));
      const capacities = attempt(problems, `${tag} capacities`, () => sim.capacities(level, raw));
      const strike = attempt(problems, `${tag} strike`, () => sim.strike(level, raw));
      nonFinite(geometry, `${tag} geometry`, problems);
      nonFinite(insight, `${tag} insight`, problems);
      nonFinite(capacities, `${tag} capacities`, problems);
      nonFinite(strike, `${tag} strike`, problems);
      if (insight && geometry) {
        if (insight.spans.length !== n.spans.length || geometry.spans.length !== n.spans.length) problems.push(`${tag}: span counts differ`);
        let least = Infinity;
        insight.spans.forEach((s, i) => {
          least = Math.min(least, s.gsf);
          if (s.gsf < 0 || s.gsf > 50 + 1e-9) problems.push(`${tag}: gsf ${s.gsf}`);
          if (s.gsf > 0 && s.thrustLine.length !== geometry.spans[i]!.joints.length) problems.push(`${tag}: thrust line of ${s.thrustLine.length} points`);
          if (s.crushing < 0 || s.crushing > 2 + 1e-9) problems.push(`${tag}: crushing ${s.crushing}`);
        });
        for (const p of insight.piers) {
          least = Math.min(least, p.stability);
          if (p.stability < 0 || p.stability > 5 + 1e-9) problems.push(`${tag}: pier stability ${p.stability}`);
        }
        if (insight.safety !== least) problems.push(`${tag}: safety ${insight.safety} is not the least margin ${least}`);
        if (strike && strike.stands !== insight.safety >= 1 - 1e-6) problems.push(`${tag}: strike stands ${strike.stands} with safety ${insight.safety}`);
        if (strike && !strike.stands && (!strike.collapse || strike.collapse.spans.length + strike.collapse.piers.length === 0)) problems.push(`${tag}: a strike collapse of nothing`);
      }
      if (capacities && (capacities.axle < 0 || capacities.quake < 0 || capacities.spread < 0 || capacities.scour < 0 || capacities.waterway < 0 || capacities.waterway > 1)) {
        problems.push(`${tag}: capacities out of range ${JSON.stringify(capacities)}`);
      }
      if (problems.length > before) problems.push(`  design ${tag}: ${JSON.stringify(raw)}`);
    }
    if (unclean.size > 0) console.info(`fixture ${key}: issues left after normalize (other than deck-too-steep): ${[...unclean].map(([code, count]) => `${code} x${count}`).join(', ')}`);
    if (problems.length > 0) console.info(`fixture ${key}: ${problems.length} problems\n${problems.slice(0, 12).join('\n')}`);
    expect(problems).toEqual([]);
    expect([...unclean.keys()]).toEqual([]);
  }, 180000);

  /** Advance to the end through `stops` (where a repair is tried), in steps of `step` years. */
  function live(run: ChronicleRun, lvl: LevelDef, stops: readonly number[], step: number, problems: string[], tag: string): { events: ChronicleEvent[]; repairs: boolean[] } {
    const events: ChronicleEvent[] = [];
    const repairs: boolean[] = [];
    let lastYear = run.year;
    const to = (target: number): void => {
      if (step <= 0) events.push(...run.advance(target));
      else {
        // Uneven small steps, landing exactly on the target.
        for (let y = run.year + step; y < target && !run.ended; y += step * (1 + ((y * 7) % 3))) events.push(...run.advance(y));
        events.push(...run.advance(target));
      }
      if (run.year < lastYear) problems.push(`${tag}: the year went back from ${lastYear} to ${run.year}`);
      lastYear = run.year;
    };
    for (const stop of stops) {
      to(stop);
      if (run.ended) break;
      repairs.push(run.repair());
    }
    to(lvl.endYear);
    if (run.advance(lvl.endYear + 50).length > 0) problems.push(`${tag}: events after the end`);
    return { events, repairs };
  }

  it('two runs of one design advanced in turn do not disturb each other', () => {
    const alone = sim.run(level, level.starter);
    const expected = JSON.stringify(alone.advance(level.endYear));
    const first = sim.run(level, level.starter);
    const second = sim.run(level, level.starter);
    const other = sim.run(level, { ...level.starter, cover: level.limits.cover[1] });
    const a: ChronicleEvent[] = [];
    const b: ChronicleEvent[] = [];
    for (let year = level.year + 7; year < level.endYear + 20; year += 13) {
      a.push(...first.advance(year));
      other.advance(year - 3);
      sim.capacities(level, level.starter);
      b.push(...second.advance(year - 5));
    }
    b.push(...second.advance(level.endYear));
    expect(JSON.stringify(a)).toBe(expected);
    expect(JSON.stringify(b)).toBe(expected);
    expect(JSON.stringify(first.state)).toBe(JSON.stringify(alone.state));
    expect(JSON.stringify(second.summary())).toBe(JSON.stringify(alone.summary()));
  }, 120000);

  it('full runs: finite, well-formed, deterministic in any call order, and the same in one step as in many (24 designs)', () => {
    const rng = new Rng(0xfeed0 + key.charCodeAt(0));
    const problems: string[] = [];
    const endings = new Map<string, number>();
    for (let trial = 0; trial < 24; trial++) {
      const raw = trial === 0 ? level.starter : wild(rng, level);
      const tag = `${key}#${trial}`;
      const before = problems.length;
      const span = level.endYear - level.year;
      const stops = trial % 2 === 0 ? [] : [level.year + Math.round(span * 0.11), level.year + Math.round(span * 0.37), level.year + Math.round(span * 0.6)];

      // First run: everything else asked first, then one big step.
      const one = attempt(problems, `${tag} run`, () => {
        sim.insight(level, raw);
        sim.capacities(level, raw);
        sim.strike(level, raw);
        const run = sim.run(level, raw);
        const upcoming = run.upcoming(50);
        for (let i = 1; i < upcoming.length; i++) if (upcoming[i]!.year < upcoming[i - 1]!.year) problems.push(`${tag}: upcoming() out of order`);
        const out = live(run, level, stops, 0, problems, tag);
        return { run, ...out };
      });
      // Second run: a fresh copy of the level (nothing cached), the run first, small steps.
      const copy = JSON.parse(JSON.stringify(level)) as LevelDef;
      const many = attempt(problems, `${tag} run in steps`, () => {
        const run = sim.run(copy, raw);
        const out = live(run, copy, stops, 0.37, problems, tag);
        sim.strike(copy, raw);
        sim.capacities(copy, raw);
        return { run, ...out };
      });
      // Underneath the public guard, so an exception cannot hide behind the starter design.
      attempt(problems, `${tag} run (internal)`, () => new Run(analysisOf(level, normalize(level, raw))).advance(level.endYear));
      if (one && many) {
        const a = one.run.summary();
        const b = many.run.summary();
        nonFinite(one.events, `${tag} events`, problems);
        nonFinite(one.run.state, `${tag} state`, problems);
        nonFinite(a, `${tag} summary`, problems);
        if (JSON.stringify(one.events) !== JSON.stringify(many.events)) {
          const i = one.events.findIndex((e, k) => JSON.stringify(e) !== JSON.stringify(many.events[k]));
          problems.push(`${tag}: events differ between one step and many (${one.events.length} vs ${many.events.length}), first at ${i}: ${JSON.stringify(one.events[i])?.slice(0, 200)} vs ${JSON.stringify(many.events[i])?.slice(0, 200)}`);
        }
        if (JSON.stringify(one.run.state) !== JSON.stringify(many.run.state)) problems.push(`${tag}: final states differ between one step and many`);
        if (JSON.stringify(a) !== JSON.stringify(b)) problems.push(`${tag}: summaries differ between one step and many`);
        if (JSON.stringify(one.repairs) !== JSON.stringify(many.repairs)) problems.push(`${tag}: repairs differ`);

        const events = one.events;
        const last = events[events.length - 1];
        for (let i = 1; i < events.length; i++) if (events[i]!.year < events[i - 1]!.year) problems.push(`${tag}: events out of order at ${i}`);
        if (!one.run.ended) problems.push(`${tag}: not ended after advancing to the end year`);
        const struck = a.collapse?.year === level.year;
        if (a.collapse && !struck && last?.kind !== 'collapse') problems.push(`${tag}: collapsed but the last event is ${last?.kind}`);
        if (!a.collapse && last?.kind !== 'end') problems.push(`${tag}: stood but the last event is ${last?.kind}`);
        if (a.lastYear < level.year || a.lastYear > level.endYear || a.years !== a.lastYear - level.year) problems.push(`${tag}: lastYear ${a.lastYear}, years ${a.years}`);
        if (a.seals.standing !== (!a.collapse && a.lastYear === level.endYear)) problems.push(`${tag}: standing seal ${a.seals.standing}`);
        if (a.masterwork !== (a.seals.standing && a.seals.lean && a.seals.unrepaired)) problems.push(`${tag}: masterwork flag`);
        if (a.collapse && a.collapse.spans.length + a.collapse.piers.length === 0) problems.push(`${tag}: a collapse of nothing`);
        if (one.run.state.collapsed !== !!a.collapse) problems.push(`${tag}: state.collapsed ${one.run.state.collapsed}`);
        for (const e of events) {
          if (e.kind === 'flood' && (e.level < e.stage - 1e-9 || e.velocity < 0 || e.drama < 0 || e.drama > 1 || e.scour.some((x) => x < 0))) problems.push(`${tag}: flood event ${JSON.stringify(e).slice(0, 200)}`);
          if ((e.kind === 'quake' || e.kind === 'load') && (e.capacity < 0 || e.drama < 0 || e.drama > 1)) problems.push(`${tag}: ${e.kind} event out of range`);
          if (e.kind === 'collapse') {
            const geometry = one.run.geometry;
            for (const s of e.info.spans) {
              if (s.delay < 0 || !geometry.spans[s.span]) problems.push(`${tag}: collapse names span ${s.span}, delay ${s.delay}`);
              for (const h of s.hinges) if (h.joint < 0 || h.joint > (geometry.spans[s.span]?.voussoirs.length ?? 0)) problems.push(`${tag}: hinge at joint ${h.joint}`);
            }
          }
        }
        const ending = a.collapse ? a.collapse.cause : 'stands';
        endings.set(ending, (endings.get(ending) ?? 0) + 1);
      }
      if (problems.length > before) problems.push(`  design ${tag}: ${JSON.stringify(raw)}`);
    }
    console.info(`fixture ${key}: endings of 24 fuzzed runs: ${[...endings].map(([cause, count]) => `${cause} x${count}`).join(', ')}`);
    if (problems.length > 0) console.info(`fixture ${key}: ${problems.length} problems\n${problems.slice(0, 12).join('\n')}`);
    expect(problems).toEqual([]);
  }, 300000);
});
