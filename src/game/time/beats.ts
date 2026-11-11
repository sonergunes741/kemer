/**
 * The beats of a run (DESIGN 2.5): what the director slows down for. The chronicle lists the
 * notable hazards in advance (never their outcome); the level lists its eras. A few of them are
 * stops (time eases down to near real time and the event plays out for a few seconds); the rest
 * are dips (time slows a little and the river swells) so the centuries keep moving.
 */
import type { UpcomingEvent } from '../../core/contracts';
import type { LevelDef } from '../../core/types';

export type BeatKind = 'flood' | 'quake' | 'load' | 'era' | 'end';

export interface Beat {
  /** Fractional year the director aims at (a flood at its usual peak in the year). */
  readonly year: number;
  /** Calendar year the chronicle processes it in. */
  readonly whole: number;
  readonly kind: BeatKind;
  /** Hold here and play the event; otherwise only slow down while passing. */
  readonly stop: boolean;
  /** Years per second at the beat itself. */
  readonly pace: number;
  readonly drama: number;
}

/** Floods played out in full besides the named ones and the greatest: enough to feel the river. */
const FULL_FLOODS = 4;
/** Pace (years per second) at a stop, at an era change and at a passing flood. */
export const STOP_PACE = 0.35;
const ERA_PACE = 1.4;
const DIP_PACE = 4;
/** Two beats closer than this (years) are one: the stronger stays. */
const MERGE = 1.5;

export function planBeats(level: LevelDef, upcoming: readonly UpcomingEvent[], greatestYear: number): Beat[] {
  const peak = level.site.flood.peakDay / 365;
  const named = new Set(level.hazards.filter((h) => h.kind === 'flood').map((h) => h.year));
  const floods = upcoming.filter((e) => e.kind === 'flood');
  // The floods that get their few seconds: named ones, the greatest, then the most dramatic.
  const full = new Set<number>();
  for (const f of floods) if (named.has(f.year) || f.year === greatestYear) full.add(f.year);
  const ranked = [...floods].sort((a, b) => b.drama - a.drama);
  for (const f of ranked) {
    if (full.size >= FULL_FLOODS + named.size + 1) break;
    full.add(f.year);
  }
  const beats: Beat[] = [];
  for (const e of upcoming) {
    if (e.year <= level.year || e.year > level.endYear) continue;
    if (e.kind === 'flood') {
      const stop = full.has(e.year);
      beats.push({ year: e.year + peak, whole: e.year, kind: 'flood', stop, pace: stop ? STOP_PACE : DIP_PACE, drama: e.drama });
    } else {
      beats.push({ year: e.year + 0.45, whole: e.year, kind: e.kind, stop: true, pace: STOP_PACE, drama: e.drama });
    }
  }
  for (const era of level.traffic) {
    if (era.from > level.year && era.from < level.endYear) beats.push({ year: era.from + 0.3, whole: era.from, kind: 'era', stop: false, pace: ERA_PACE, drama: 0.3 });
  }
  beats.sort((a, b) => a.year - b.year);
  const merged: Beat[] = [];
  for (const b of beats) {
    const prev = merged[merged.length - 1];
    if (prev && b.year - prev.year < MERGE && b.kind !== 'era' && prev.kind !== 'era') {
      // Keep the one that matters more; a stop always wins over a dip.
      if (rank(b) > rank(prev)) merged[merged.length - 1] = b;
      continue;
    }
    merged.push(b);
  }
  merged.push({ year: level.endYear, whole: level.endYear, kind: 'end', stop: true, pace: STOP_PACE, drama: 0 });
  return merged;
}

function rank(b: Beat): number {
  return (b.stop ? 10 : 0) + (b.kind === 'flood' ? 0 : 1) + b.drama;
}
