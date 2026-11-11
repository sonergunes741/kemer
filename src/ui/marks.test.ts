import { describe, expect, it } from 'vitest';
import { markPath, nearestPoint, normalizeMark, PRESET_MARKS, sameMark, toggleStroke } from './marks';

describe('marks', () => {
  it('has twelve valid, distinct presets', () => {
    expect(PRESET_MARKS).toHaveLength(12);
    for (const m of PRESET_MARKS) {
      expect(m.strokes.length).toBeGreaterThan(0);
      expect(normalizeMark(m)).toEqual(m);
    }
    for (let i = 0; i < PRESET_MARKS.length; i++) {
      for (let j = i + 1; j < PRESET_MARKS.length; j++) expect(sameMark(PRESET_MARKS[i]!, PRESET_MARKS[j]!)).toBe(false);
    }
  });

  it('normalises direction, order, duplicates and bad points', () => {
    const m = normalizeMark({ strokes: [[5, 1], [1, 5], [4, 4], [0, 9], [2, 0]] });
    expect(m.strokes).toEqual([[0, 2], [1, 5]]);
  });

  it('drawing over a line erases it', () => {
    let m = toggleStroke({ strokes: [] }, 0, 4);
    m = toggleStroke(m, 4, 8);
    expect(m.strokes).toEqual([[0, 4], [4, 8]]);
    m = toggleStroke(m, 4, 0);
    expect(m.strokes).toEqual([[4, 8]]);
    expect(toggleStroke(m, 3, 3)).toBe(m);
  });

  it('compares marks regardless of stroke order', () => {
    expect(sameMark({ strokes: [[0, 4], [4, 8]] }, { strokes: [[8, 4], [4, 0]] })).toBe(true);
    expect(sameMark(null, null)).toBe(true);
    expect(sameMark(null, { strokes: [] })).toBe(false);
  });

  it('draws one path segment per stroke', () => {
    expect(markPath({ strokes: [[0, 8]] }, 100, 10)).toBe('M10 10L90 90');
    expect(markPath({ strokes: [] }, 100, 10)).toBe('');
  });

  it('snaps to the nearest grid point within reach only', () => {
    expect(nearestPoint(52, 48, 100, 10, 12)).toBe(4);
    expect(nearestPoint(30, 30, 100, 10, 12)).toBeNull();
    expect(nearestPoint(88, 12, 100, 10, 12)).toBe(2);
  });
});
