/**
 * The balance report of one level (docs/LEVELS.md, "Balance"): the starter's fate, the cheapest
 * designs that pass and that stand in 2026, the par those suggest, whether all three seals can be
 * had in one run, and how first-instinct designs fail. scripts/balance.ts prints these.
 */
import type { SimApi } from '../../core/contracts';
import type { LevelDef } from '../../core/types';
import { CAREFUL_REPAIRS, DEFAULT_SEARCH, Evaluator, cheapest, passes, standsCarefully, unrepairedStanding, type Found, type SearchOptions } from './search';
import { describe, type Params } from './space';
import { fate, trial, type Outcome, type RepairPolicy } from './trial';

export interface LevelReport {
  readonly level: LevelDef;
  readonly greatest: { readonly year: number; readonly stage: number };
  readonly starter: { readonly none: Outcome; readonly warn: Outcome };
  readonly pass: Found | null;
  /** The cheapest design standing in 2026 with at most CAREFUL_REPAIRS repairs, per policy. */
  readonly stand: Readonly<Record<RepairPolicy, Found | null>>;
  /** The cheapest of the three, repairs included. */
  readonly cheapestStand: Found | null;
  /**
   * 15 % over the dearer of the cheapest careful bridge (`cheapestStand`) and the cheapest one with
   * no repair before the greatest flood (`master`), so that both the lean seal with a few repairs
   * and the masterwork are in reach (LEVELS.md asks for 12 to 18 % over the cheapest standing).
   */
  readonly suggestedPar: number | null;
  /** The cheapest design standing with no repair before the greatest flood (left alone, or repaired only after it). */
  readonly master: Found | null;
  readonly naive: Readonly<Record<'thin' | 'low' | 'few', Outcome | null>>;
  readonly runs: number;
  readonly ms: number;
}

export function balanceLevel(sim: SimApi, level: LevelDef, options: SearchOptions = DEFAULT_SEARCH): LevelReport {
  const t0 = performance.now();
  const ev = new Evaluator(sim, level, Infinity);
  const starter = { none: trial(sim, level, level.starter, 'none'), warn: trial(sim, level, level.starter, 'warn') };
  const pass = cheapest(ev, passes, 'none', options);
  const seeds: Params[] = pass ? [pass.params] : [];
  const stand: Record<RepairPolicy, Found | null> = { none: null, after: null, warn: null };
  for (const policy of ['none', 'after', 'warn'] as const) {
    stand[policy] = cheapest(ev, standsCarefully, policy, { ...options, seeds: [...seeds, ...Object.values(stand).flatMap((f) => (f ? [f.params] : []))] });
  }
  let cheapestStand: Found | null = null;
  for (const f of Object.values(stand)) if (f && (!cheapestStand || f.outcome.stones < cheapestStand.outcome.stones)) cheapestStand = f;
  // A bridge left alone that stands is unrepaired too; repairs after the greatest flood may be cheaper or dearer.
  const after = cheapest(ev, unrepairedStanding, 'after', { ...options, seeds: Object.values(stand).flatMap((f) => (f ? [f.params] : [])) });
  const master = stand.none && (!after || stand.none.outcome.stones <= after.outcome.stones) ? stand.none : after;
  const base = pass?.params ?? ev.starter();
  const r = ev.space.ranges;
  const naive = {
    thin: r.thickness.step > 0 ? ev.eval({ ...base, thickness: r.thickness.lo }, 'none') : null,
    low: r.rise.step > 0 ? ev.eval({ ...base, rise: 0.12 }, 'none') : null,
    few: r.piers.step > 0 ? ev.eval({ ...base, piers: r.piers.lo }, 'none') : null,
  };
  return {
    level,
    greatest: sim.greatestFlood(level),
    starter,
    pass,
    stand,
    cheapestStand,
    suggestedPar: cheapestStand || master ? Math.round(Math.max(cheapestStand?.outcome.stones ?? 0, master?.outcome.stones ?? 0) * 1.15) : null,
    master,
    naive,
    runs: ev.runs,
    ms: performance.now() - t0,
  };
}

const cell = (f: Found | null): string => (f ? `${f.outcome.stones}` : 'none');

function outcomeCell(o: Outcome | null): string {
  if (!o) return 'n/a';
  return `${fate(o)} (${o.stones})`;
}

/** One markdown row per level for docs/BALANCE.md. */
export function summaryTable(reports: readonly LevelReport[]): string {
  const head = [
    '| # | River | Par | Starter (no repair) | Starter (repairs) | Cheapest pass | Cheapest 2026: none / after / warn | Suggested par | Cheapest unrepaired 2026 | Masterwork at par |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  const rows = reports.map((r) => {
    const par = r.level.parStones;
    const mw = r.master ? (r.master.outcome.stones <= par ? 'yes' : `no (${r.master.outcome.stones})`) : 'no';
    return `| ${r.level.index} | ${r.level.id} | ${par} | ${outcomeCell(r.starter.none)} | ${outcomeCell(r.starter.warn)} | ${cell(r.pass)} | ${cell(r.stand.none)} / ${cell(r.stand.after)} / ${cell(r.stand.warn)} | ${r.suggestedPar ?? '-'} | ${cell(r.master)} | ${mw} |`;
  });
  return [...head, ...rows].join('\n');
}

/** The designs behind the numbers and how naive designs fare, per level. */
export function details(r: LevelReport): string {
  const lines = [`### ${r.level.index}. ${r.level.id}`, ''];
  lines.push(`- Greatest flood: ${r.greatest.year}, stage ${r.greatest.stage.toFixed(2)} m. Search: ${r.runs} runs, ${(r.ms / 1000).toFixed(1)} s.`);
  lines.push(`- Starter: ${outcomeCell(r.starter.none)} without repairs; ${outcomeCell(r.starter.warn)} repairing when the gauge trembles.`);
  const show = (label: string, f: Found | null): void => {
    const repairs = f ? f.outcome.summary.repairs : 0;
    lines.push(f ? `- ${label}: ${f.outcome.stones} stones (${f.outcome.policy}; ${fate(f.outcome)}; ${repairs} repair${repairs === 1 ? '' : 's'}): ${describe(f.params)}.` : `- ${label}: none found.`);
  };
  show('Cheapest passing', r.pass);
  show('Cheapest standing in 2026, no repairs', r.stand.none);
  show(`Cheapest standing in 2026, repairs after the greatest flood (at most ${CAREFUL_REPAIRS})`, r.stand.after);
  show(`Cheapest standing in 2026, repairs when the gauge trembles (at most ${CAREFUL_REPAIRS})`, r.stand.warn);
  show('Cheapest standing with no repair before the greatest flood', r.master);
  lines.push(`- Thin ring: ${outcomeCell(r.naive.thin)}. Low rise: ${outcomeCell(r.naive.low)}. Fewest piers: ${outcomeCell(r.naive.few)}.`);
  return lines.join('\n');
}
