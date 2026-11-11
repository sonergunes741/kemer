import { describe, expect, it } from 'vitest';
import { emptySave } from '../core/config';
import type { BridgeDesign, RunSummary } from '../core/types';
import { LEVELS } from '../content';
import { continueLevel, isFirstRun, isUnlocked, ledgerEntries, recordAttempt, witnessedIn } from './progress';

const design = LEVELS[0]!.starter;

function summary(patch: Partial<RunSummary>): RunSummary {
  return {
    level: 'koramaz',
    builtYear: 1147,
    lastYear: 1207,
    years: 60,
    passed: true,
    seals: { standing: false, lean: false, unrepaired: false },
    masterwork: false,
    stones: 300,
    repairs: 0,
    ...patch,
  };
}

describe('progress', () => {
  it('opens the first river, and each next one once the one before is passed', () => {
    const save = emptySave('tr');
    expect(isUnlocked(LEVELS, save, 0)).toBe(true);
    expect(isUnlocked(LEVELS, save, 1)).toBe(false);
    save.levels.koramaz = recordAttempt(null, summary({}), design, null, []).record;
    expect(isUnlocked(LEVELS, save, 1)).toBe(true);
    expect(isUnlocked(LEVELS, save, 2)).toBe(false);
    expect(ledgerEntries(LEVELS, save, () => null).map((e) => e.unlocked).slice(0, 3)).toEqual([true, true, false]);
  });

  it('continues at the first open river not yet passed', () => {
    const save = emptySave('en');
    expect(continueLevel(LEVELS, save).id).toBe('koramaz');
    expect(isFirstRun(save)).toBe(true);
    save.levels.koramaz = recordAttempt(null, summary({ passed: false, years: 0 }), design, null, []).record;
    expect(continueLevel(LEVELS, save).id).toBe('koramaz');
    expect(isFirstRun(save)).toBe(false);
    save.levels.koramaz = recordAttempt(save.levels.koramaz, summary({}), design, null, []).record;
    expect(continueLevel(LEVELS, save).id).toBe('zamanti');
  });

  it('keeps seals once earned, counts attempts and reports only new seals', () => {
    const first = recordAttempt(null, summary({ years: 879, lastYear: 2026, seals: { standing: true, lean: true, unrepaired: false }, stones: 696 }), design, { span: 0, stone: 3 }, [1683]);
    expect(first.newSeals).toEqual(['standing', 'lean']);
    expect(first.newlyPassed).toBe(true);
    const thinner: BridgeDesign = { ...design, spans: design.spans.map((s) => ({ ...s, thickness: 0.2 })) };
    const second = recordAttempt(first.record, summary({ passed: false, years: 0, lastYear: 1147 }), thinner, null, []);
    expect(second.newSeals).toEqual([]);
    expect(second.newlyPassed).toBe(false);
    expect(second.record.attempts).toBe(2);
    expect(second.record.seals).toEqual({ standing: true, lean: true, unrepaired: false });
    // The standing bridge stays in the ledger, not the one that fell.
    expect(second.record.design).toBe(design);
    expect(second.record.bestYears).toBe(879);
    expect(second.record.witnessed).toEqual([1683]);
  });

  it('witnesses the named hazards and the greatest flood the bridge lived through', () => {
    const level = LEVELS[0]!;
    const all = witnessedIn(level, level.endYear, { year: 1683 });
    expect(all).toContain(1683);
    expect(witnessedIn(level, level.year, { year: 1683 })).toEqual([]);
  });
});
