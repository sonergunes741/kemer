import { describe, expect, it } from 'vitest';
import { COMMA_CENTS, degreeCents, degreeCommas, degreeFreq, MAKAMS, regionMakam, widestStep, type MakamId } from './tuning';

const ids = Object.keys(MAKAMS) as MakamId[];

describe('makam tables', () => {
  it('every makam has seven steps that fill one 53-comma octave', () => {
    for (const id of ids) {
      const m = MAKAMS[id];
      expect(m.steps).toHaveLength(7);
      expect(m.steps.reduce((a, b) => a + b, 0)).toBe(53);
      expect(m.guclu).toBeGreaterThan(0);
      expect(m.guclu).toBeLessThan(7);
    }
  });

  it('octaves are exact and degrees extend below the tonic', () => {
    for (const id of ids) {
      const m = MAKAMS[id];
      expect(degreeFreq(m, 0)).toBeCloseTo(m.tonic, 6);
      expect(degreeFreq(m, 7)).toBeCloseTo(m.tonic * 2, 6);
      expect(degreeFreq(m, -7)).toBeCloseTo(m.tonic / 2, 6);
      expect(degreeCommas(m, -1)).toBe(-(m.steps[6] as number));
    }
  });

  it('keeps the characteristic microtonal steps', () => {
    // Uşşak and Hüseyni: the segâh lies 8 commas above dügâh, a neutral second (~181 cents).
    expect(degreeCents(MAKAMS.ussak, 1)).toBeCloseTo(8 * COMMA_CENTS, 6);
    expect(degreeCents(MAKAMS.huseyni, 1)).toBeCloseTo(181.13, 1);
    // Rast: the third is a little flat of a tempered major third.
    expect(degreeCents(MAKAMS.rast, 2)).toBeCloseTo(384.9, 1);
    // Hicaz: the augmented second between degrees 1 and 2.
    expect(MAKAMS.hicaz.steps[1]).toBe(12);
    expect(widestStep(MAKAMS.hicaz)).toBe(12);
    // Saba: the diminished fourth from durak to its fourth degree (18 commas, ~408 cents).
    expect(degreeCommas(MAKAMS.saba, 3)).toBe(18);
    // Kürdi opens with a bakiye (4 commas).
    expect(MAKAMS.kurdi.steps[0]).toBe(4);
  });

  it('maps every river to a makam and falls back for unknown indices', () => {
    for (let i = 0; i <= 13; i++) expect(ids).toContain(regionMakam(i));
    expect(regionMakam(-3)).toBe('ussak');
    expect(regionMakam(99)).toBe('ussak');
    expect(regionMakam(5)).toBe('hicaz');
  });
});
