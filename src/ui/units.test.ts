import { beforeAll, describe, expect, it } from 'vitest';
import { ARSIN, PARMAK } from '../core/config';
import { setLang } from '../core/i18n';
import type { Capacities, LevelDef } from '../core/types';
import { registerUiStrings } from '../i18n';
import { capacityItems, formatLength, formatLengthShort, formatSafety, formatYear, formatYears, safetyLevel, safetyWord } from './units';

const caps: Capacities = { axle: 140, quake: 0.21, floodFree: 4.6, waterway: 0.8, scour: 0.4, spread: 0.05 };

// capacityItems only reads the river's traffic and hazards; the rest of a level is irrelevant here.
const level = (quake: boolean): LevelDef =>
  ({
    traffic: [{ from: 1176, to: 2026, actors: [], axle: 120 }],
    hazards: quake ? [{ kind: 'quake', year: 1784, pga: 0.25 }] : [],
  }) as Pick<LevelDef, 'traffic' | 'hazards'> as LevelDef;

beforeAll(() => {
  registerUiStrings();
  setLang('tr');
});

describe('formatLength', () => {
  it('reads metres with the right precision', () => {
    expect(formatLength(0.62, 'metre', 'tr')).toBe('0,62 m');
    expect(formatLength(5.04, 'metre', 'tr')).toBe('5,0 m');
    expect(formatLength(140, 'metre', 'tr')).toBe('140 m');
  });

  it('reads arşın and parmak', () => {
    expect(formatLength(ARSIN * 3, 'arsin', 'tr')).toBe('3 arşın');
    expect(formatLength(ARSIN * 2 + PARMAK * 5, 'arsin', 'tr')).toBe('2 arşın 5 parmak');
    expect(formatLength(PARMAK * 7, 'arsin', 'tr')).toBe('7 parmak');
    // Past twenty arşın the parmak is dropped.
    expect(formatLength(ARSIN * 25 + PARMAK * 3, 'arsin', 'tr')).toBe('25 arşın');
    expect(formatLength(-ARSIN, 'arsin', 'tr')).toBe('−1 arşın');
  });

  it('never prints NaN', () => {
    expect(formatLength(Number.NaN, 'metre', 'tr')).toBe('—');
    expect(formatLengthShort(Number.POSITIVE_INFINITY, 'arsin', 'tr')).toBe('—');
  });
});

describe('safety', () => {
  it('names the four moods at their thresholds', () => {
    expect(safetyLevel(0.99)).toBe('falls');
    expect(safetyLevel(Number.NaN)).toBe('falls');
    expect(safetyLevel(1)).toBe('narrow');
    expect(safetyLevel(1.24)).toBe('narrow');
    expect(safetyLevel(1.25)).toBe('sound');
    expect(safetyLevel(2.99)).toBe('sound');
    expect(safetyLevel(3)).toBe('heavy');
    expect(safetyWord(0.5)).toBe('yıkılır');
    expect(safetyWord(1.8)).toBe('sağlam');
  });

  it('truncates the number so a falling arch never reads 1,0', () => {
    expect(formatSafety(0.97, 'tr')).toBe('0,9');
    expect(formatSafety(1.0, 'tr')).toBe('1,0');
    expect(formatSafety(1.29, 'tr')).toBe('1,2');
    expect(formatSafety(1.3, 'en')).toBe('1.3');
    expect(formatSafety(-2, 'tr')).toBe('0,0');
  });
});

describe('capacityItems', () => {
  it('shows load, quake and flood margin on a river with an earthquake', () => {
    const items = capacityItems(caps, level(true), [1.9, 3.4], false, 'metre', 'tr');
    expect(items.map((i) => i.key)).toEqual(['load', 'quake', 'flood']);
    expect(items[0]!.value).toBe('14 ton');
    expect(items[0]!.short).toBe(false);
    // 0.21 g against a 0.25 g quake: short.
    expect(items[1]!.short).toBe(true);
    expect(items[2]!.value).toBe('1,2 m');
  });

  it('falls back to scour where piers stand and no quake comes', () => {
    const items = capacityItems(caps, level(false), [], true, 'metre', 'tr');
    expect(items.map((i) => i.key)).toEqual(['load', 'scour', 'flood']);
    expect(items[1]!.value).toBe('%40');
    expect(items[2]!.label.toLowerCase()).toContain('sel');
  });

  it('flags a flood that would drown the crown', () => {
    const items = capacityItems({ ...caps, floodFree: 2 }, level(false), [3.4], false, 'metre', 'tr');
    const flood = items.find((i) => i.key === 'flood')!;
    expect(flood.short).toBe(true);
  });
});

describe('years', () => {
  it('groups counts but never calendar years', () => {
    expect(formatYear(1683.9)).toBe('1683');
    expect(formatYears(8456, 'tr')).toBe('8.456 yıl');
    expect(formatYears(-3, 'tr')).toBe('0 yıl');
  });
});
