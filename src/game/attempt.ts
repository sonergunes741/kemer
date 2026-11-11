/**
 * Closing an attempt: what a fall or a result writes into the ledger (best years and stones,
 * seals, masterwork, the hazards now witnessed, the design and where the mark was cut), once per
 * attempt, saved at once. In the endless modes it also writes the mode's own record and leaves
 * the line the result shows for it.
 */
import { formatNumber } from '../core/format';
import type { BridgeGeometry, CollapseInfo, LevelDef, RunSummary } from '../core/types';
import { isoDate, recordDaily, recordMillennium } from './endless';
import type { GameContext } from './phases/base';
import { recordAttempt, witnessedIn, type AttemptOutcome } from './progress';
import { say } from './text';

/** The summary of a bridge that fell when its centering was struck: no years, no seals. */
export function strikeSummary(level: LevelDef, geometry: BridgeGeometry, info: CollapseInfo): RunSummary {
  return {
    level: level.id,
    builtYear: level.year,
    lastYear: level.year,
    years: 0,
    passed: false,
    seals: { standing: false, lean: false, unrepaired: false },
    masterwork: false,
    stones: geometry.stones.total,
    repairs: 0,
    collapse: info,
  };
}

/** The river of the day's streak and best, or the thousand years' best, as one line. */
function modeRecord(g: GameContext, summary: RunSummary): string | null {
  const { session } = g;
  const n = (v: number): string => formatNumber(v, 0);
  if (session.mode === 'daily') {
    const o = recordDaily(session.save, session.date ?? isoDate(), summary);
    // A streak of one is no streak yet: just the day's best.
    const line = o.streak > 1 ? say('dailyLine', { streak: o.streak, best: n(o.best) }) : say('dailyFirst', { best: n(o.best) });
    return o.newBest && summary.years > 0 ? `${line} · ${say('newBest')}` : line;
  }
  if (session.mode === 'millennium') {
    const o = recordMillennium(session.save, summary);
    const line = o.standing ? say('millenniumStones', { n: n(summary.stones), best: n(o.bestStones ?? summary.stones) }) : say('millenniumYears', { n: n(summary.years), best: n(o.bestYears) });
    return o.newBest ? `${line} · ${say('newBest')}` : line;
  }
  return null;
}

/** Write the attempt into the save (once) and return what changed. */
export function closeAttempt(g: GameContext, summary: RunSummary): AttemptOutcome | null {
  const { session, deps } = g;
  const level = session.level;
  const built = session.built;
  if (!level || !built) return null;
  if (session.closed) return session.closed;
  const greatest = deps.sim.greatestFlood(level);
  const witnessed = witnessedIn(level, summary.lastYear, greatest);
  // The flood or quake that did it is now written in the ledger for this river.
  const hazard = summary.collapse?.hazard;
  if (hazard && hazard.year <= summary.lastYear) witnessed.push(hazard.year);
  const outcome = recordAttempt(session.record(level.id), summary, built.design, session.markStone, witnessed);
  session.setRecord(level.id, outcome.record);
  session.closed = outcome;
  session.modeLine = modeRecord(g, summary);
  g.persist();
  return outcome;
}
