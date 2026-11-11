import { describe, expect, it } from 'vitest';
import { addTick, centuryTicks, displayYear, outlastYear, seasonIndex, yearFraction } from './timeline';

describe('timeline', () => {
  it('places years along the line, clamped', () => {
    expect(yearFraction(1176, 1176, 2026)).toBe(0);
    expect(yearFraction(1601, 1176, 2026)).toBeCloseTo(0.5);
    expect(yearFraction(2100, 1176, 2026)).toBe(1);
    expect(yearFraction(1000, 1176, 1176)).toBe(1);
  });

  it('ticks the centuries but not those crowding an end', () => {
    expect(centuryTicks(1176, 2026)).toEqual([1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000]);
    expect(centuryTicks(1190, 2010)).toEqual([1300, 1400, 1500, 1600, 1700, 1800, 1900]);
    expect(centuryTicks(2026, 1176)).toEqual([]);
  });

  it('adds event ticks once, sorted', () => {
    expect(addTick([1683], 1784)).toEqual([1683, 1784]);
    expect(addTick([1683, 1784], 1683.4)).toEqual([1683, 1784]);
    expect(addTick([1784], 1683)).toEqual([1683, 1784]);
    expect(addTick([1683], Number.NaN)).toEqual([1683]);
  });

  it('marks the year the bridge outlasts its builder', () => {
    expect(outlastYear(1176, 60, 2026)).toBe(1236);
    expect(outlastYear(1176, 0, 2026)).toBeNull();
    expect(outlastYear(2000, 60, 2026)).toBeNull();
  });

  it('shows whole years inside the run', () => {
    expect(displayYear(1683.999, 1176, 2026)).toBe(1683);
    expect(displayYear(1683.9999999, 1176, 2026)).toBe(1684);
    expect(displayYear(2030, 1176, 2026)).toBe(2026);
    expect(displayYear(1100, 1176, 2026)).toBe(1176);
  });

  it('lets winter straddle the new year', () => {
    expect(seasonIndex(0)).toBe(0);
    expect(seasonIndex(0.95)).toBe(0);
    expect(seasonIndex(0.25)).toBe(1);
    expect(seasonIndex(0.5)).toBe(2);
    expect(seasonIndex(0.75)).toBe(3);
    expect(seasonIndex(-0.05)).toBe(0);
  });
});
