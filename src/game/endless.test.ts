import { describe, expect, it } from 'vitest';
import { emptySave } from '../core/config';
import type { RunSummary } from '../core/types';
import { isoDate, previousDay, recordDaily, recordMillennium, staleDaily } from './endless';

function summary(years: number, standing: boolean, stones = 1000): RunSummary {
  return {
    level: 'daily',
    builtYear: 2026 - years,
    lastYear: 2026,
    years,
    passed: years >= 30,
    seals: { standing, lean: false, unrepaired: false },
    masterwork: false,
    stones,
    repairs: 0,
  };
}

describe('dates', () => {
  it('formats the local date and steps back across months and years', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2024-03-01')).toBe('2024-02-29');
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
  });
});

describe('river of the day', () => {
  it('counts days played in a row and starts again after a gap', () => {
    const save = emptySave('tr');
    expect(recordDaily(save, '2026-11-09', summary(100, false)).streak).toBe(1);
    expect(recordDaily(save, '2026-11-09', summary(200, false)).streak).toBe(1);
    expect(recordDaily(save, '2026-11-10', summary(50, false)).streak).toBe(2);
    expect(recordDaily(save, '2026-11-12', summary(50, false)).streak).toBe(1);
  });

  it('keeps the best of each day and says when it is new', () => {
    const save = emptySave('tr');
    expect(recordDaily(save, '2026-11-11', summary(300, false))).toMatchObject({ best: 300, newBest: true });
    expect(recordDaily(save, '2026-11-11', summary(200, false))).toMatchObject({ best: 300, newBest: false });
    expect(recordDaily(save, '2026-11-11', summary(500, true))).toMatchObject({ best: 500, newBest: true });
  });

  it('keeps only recent days', () => {
    const save = emptySave('tr');
    for (let d = 1; d <= 28; d++) recordDaily(save, `2026-10-${String(d).padStart(2, '0')}`, summary(d, false));
    for (let d = 1; d <= 28; d++) recordDaily(save, `2026-11-${String(d).padStart(2, '0')}`, summary(d, false));
    expect(Object.keys(save.daily.best).length).toBe(40);
    expect(save.daily.best['2026-11-28']).toBe(28);
    expect(save.daily.best['2026-10-01']).toBeUndefined();
  });

  it("forgets yesterday's river record on a new day", () => {
    const save = emptySave('tr');
    save.daily.last = '2026-11-10';
    save.levels.daily = { bestYears: 1, bestStones: null, seals: { standing: false, lean: false, unrepaired: false }, masterwork: false, passed: false, attempts: 1, design: null, markStone: null, witnessed: [] };
    expect(staleDaily(save, '2026-11-10')).toBe(false);
    expect(staleDaily(save, '2026-11-11')).toBe(true);
  });
});

describe('thousand years', () => {
  it('ranks standing bridges by fewest stones and fallen ones by years', () => {
    const save = emptySave('tr');
    expect(recordMillennium(save, summary(400, false))).toMatchObject({ bestStones: null, bestYears: 400, newBest: true });
    expect(recordMillennium(save, summary(300, false)).newBest).toBe(false);
    expect(recordMillennium(save, summary(1000, true, 6000))).toMatchObject({ bestStones: 6000, newBest: true });
    expect(recordMillennium(save, summary(1000, true, 7000))).toMatchObject({ bestStones: 6000, newBest: false });
    expect(recordMillennium(save, summary(1000, true, 5000))).toMatchObject({ bestStones: 5000, newBest: true });
    // Once one has stood, a long-lived fallen bridge is no longer a best.
    expect(recordMillennium(save, summary(999, false)).newBest).toBe(false);
  });
});
