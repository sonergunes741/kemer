import { describe, expect, it } from 'vitest';
import type { MusicMood } from '../core/contracts';
import { makeRandom } from './dsp';
import { hasPhrases, MOODS } from './moods';
import { makeChord, makePhrase, reflect, restingDegrees } from './phrase';
import { MAKAMS, type MakamId } from './tuning';

const moods = Object.keys(MOODS) as MusicMood[];

describe('mood profiles', () => {
  it('covers every mood with sane ranges', () => {
    for (const m of moods) {
      const p = MOODS[m];
      expect(p.notes[0]).toBeLessThanOrEqual(p.notes[1]);
      expect(p.rest[0]).toBeLessThanOrEqual(p.rest[1]);
      expect(p.register[0]).toBeLessThan(p.register[1]);
      expect(p.level).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps none and hush free of melody, and the fall alone', () => {
    expect(hasPhrases(MOODS.none)).toBe(false);
    expect(hasPhrases(MOODS.hush)).toBe(false);
    expect(MOODS.none.level).toBe(0);
    // Elegy waits before it speaks.
    expect(MOODS.elegy.firstDelay[0]).toBeGreaterThanOrEqual(3);
  });

  it('rests far longer than it plays (sparse)', () => {
    for (const m of moods.filter((x) => hasPhrases(MOODS[x]))) {
      const p = MOODS[m];
      expect(p.rest[0]).toBeGreaterThanOrEqual(2.5);
      expect(p.notes[1]).toBeLessThanOrEqual(7);
    }
  });
});

describe('phrases', () => {
  it('stay in the register, move forward in time and come to rest', () => {
    const rnd = makeRandom(42);
    for (const m of moods.filter((x) => hasPhrases(MOODS[x]))) {
      const p = MOODS[m];
      for (const id of Object.keys(MAKAMS) as MakamId[]) {
        const makam = MAKAMS[id];
        for (let k = 0; k < 20; k++) {
          const phrase = makePhrase(rnd, p, makam);
          expect(phrase.notes.length).toBeGreaterThanOrEqual(Math.max(1, p.notes[0]));
          expect(phrase.notes.length).toBeLessThanOrEqual(p.notes[1]);
          let t = -1;
          for (const n of phrase.notes) {
            expect(n.degree).toBeGreaterThanOrEqual(p.register[0]);
            expect(n.degree).toBeLessThanOrEqual(p.register[1]);
            expect(n.t).toBeGreaterThan(t);
            expect(n.dur).toBeGreaterThan(0);
            expect(n.vel).toBeGreaterThan(0);
            expect(n.vel).toBeLessThanOrEqual(1);
            t = n.t;
          }
          const last = phrase.notes[phrase.notes.length - 1];
          if (phrase.notes.length > 1) expect(restingDegrees(makam, p.register[0], p.register[1])).toContain(last?.degree);
          expect(phrase.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('is deterministic for a seed', () => {
    const a = makePhrase(makeRandom(7), MOODS.time, MAKAMS.huseyni);
    const b = makePhrase(makeRandom(7), MOODS.time, MAKAMS.huseyni);
    expect(a).toEqual(b);
  });

  it('builds the warm chord on durak and güçlü', () => {
    const c = makeChord(MAKAMS.rast);
    expect(c.notes.map((n) => n.degree)).toEqual([-7, -3, 0, -3]);
    expect(c.notes.some((n) => n.inst === 'ney')).toBe(true);
  });

  it('reflects degrees back into range', () => {
    expect(reflect(9, 0, 7)).toBe(5);
    expect(reflect(-2, 0, 7)).toBe(2);
    expect(reflect(3, 0, 7)).toBe(3);
    expect(reflect(40, 0, 7)).toBeGreaterThanOrEqual(0);
  });
});
