/**
 * The two endless modes' records (DESIGN 3), pure: the river of the day counts the days played in a
 * row and keeps each day's best; the thousand years keeps the fewest stones of a bridge that stood
 * to 2026 and the most years of one that did not. Unit-tested in endless.test.ts.
 */
import type { RunSummary, SaveData } from '../core/types';

/** Days of daily bests kept in the save; older ones are dropped. */
const KEEP_DAYS = 40;

/** The local calendar date, YYYY-MM-DD: the river of the day changes at the player's midnight. */
export function isoDate(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The day before an ISO date (calendar arithmetic in UTC, so no daylight-saving hour can slip). */
export function previousDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) - 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export interface DailyOutcome {
  readonly streak: number;
  readonly best: number;
  readonly newBest: boolean;
}

/** Write one finished attempt at the river of `date` (standing or fallen: either way it was played). */
export function recordDaily(save: SaveData, date: string, summary: RunSummary): DailyOutcome {
  const daily = save.daily;
  if (daily.last !== date) {
    daily.streak = daily.last === previousDay(date) ? daily.streak + 1 : 1;
    daily.last = date;
  }
  const before = daily.best[date];
  const best = Math.max(before ?? 0, summary.years);
  daily.best[date] = best;
  const dates = Object.keys(daily.best).sort();
  for (const old of dates.slice(0, Math.max(0, dates.length - KEEP_DAYS))) delete daily.best[old];
  return { streak: daily.streak, best, newBest: before === undefined || summary.years > before };
}

export interface MillenniumOutcome {
  readonly standing: boolean;
  /** Fewest stones of a bridge that stood the thousand years, if any has. */
  readonly bestStones: number | null;
  readonly bestYears: number;
  readonly newBest: boolean;
}

/** Fewest stones wins, among bridges that stand in 2026; until one does, the most years. */
export function recordMillennium(save: SaveData, summary: RunSummary): MillenniumOutcome {
  const m = save.millennium;
  const standing = summary.seals.standing;
  let newBest = false;
  if (standing && (m.bestStones === null || summary.stones < m.bestStones)) {
    m.bestStones = summary.stones;
    newBest = true;
  }
  if (summary.years > m.bestYears) {
    m.bestYears = summary.years;
    if (m.bestStones === null) newBest = true;
  }
  return { standing, bestStones: m.bestStones, bestYears: m.bestYears, newBest };
}

/** Is the river of the day's record in the save from an earlier day? Then it is a different river. */
export function staleDaily(save: SaveData, date: string): boolean {
  return save.daily.last !== date && !!save.levels.daily;
}
