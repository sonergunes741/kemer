/**
 * One bridge through the centuries the way a player would run it: no repairs, repairs whenever
 * the gauge runs low, or repairs only once the river's greatest flood has passed (which keeps the
 * "unrepaired" seal). Used by the balance script, the recorded balance tests and the daily par.
 */
import type { SimApi } from '../../core/contracts';
import type { BridgeDesign, LevelDef, RunSummary } from '../../core/types';

export type RepairPolicy = 'none' | 'warn' | 'after';

export interface Outcome {
  readonly design: BridgeDesign;
  readonly policy: RepairPolicy;
  /** Stones of the build plus every repair. */
  readonly stones: number;
  readonly built: number;
  /** Dead-load safety when new. */
  readonly safety: number;
  readonly summary: RunSummary;
  /** Seals with the lean seal judged against `par` (the level's own when not given). */
  readonly masterwork: boolean;
}

/** A repair is only worth its stones this often, even if the gauge keeps trembling. */
const REPAIR_GAP = 20;
/**
 * A careful player repairs when the şakül trembles: the service safety under 1.25, which for
 * anything that wears slowly comes at least fifteen years before the fall (SIM-SPEC section 10).
 */
const REPAIR_BELOW = 1.25;

export function trial(sim: SimApi, level: LevelDef, design: BridgeDesign, policy: RepairPolicy, par = level.parStones): Outcome {
  const d = sim.normalize(level, design);
  const insight = sim.insight(level, d);
  const run = sim.run(level, d);
  const greatest = policy === 'after' ? sim.greatestFlood(level).year : -Infinity;
  let lastRepair = -Infinity;
  if (policy === 'none') {
    run.advance(level.endYear);
  } else {
    for (let year = Math.floor(level.year) + 1; year <= level.endYear && !run.ended; year++) {
      const events = run.advance(year);
      if (run.ended || year <= greatest || year - lastRepair < REPAIR_GAP) continue;
      const trembling = events.some((e) => e.kind === 'warning') || run.state.safety < REPAIR_BELOW;
      if (trembling && run.quote().possible && run.repair()) lastRepair = year;
    }
  }
  const summary = run.summary();
  const lean = summary.seals.standing && summary.stones <= par;
  return {
    design: d,
    policy,
    stones: summary.stones,
    built: insight.stones.total,
    safety: insight.safety,
    summary,
    masterwork: lean && summary.seals.standing && summary.seals.unrepaired,
  };
}

/** "1683 flood-wash", "stands", for tables and test messages. */
export function fate(outcome: Outcome): string {
  const c = outcome.summary.collapse;
  return c ? `${c.year} ${c.cause}` : 'stands';
}
