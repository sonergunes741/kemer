import { describe, expect, it } from 'vitest';
import { birdSeason, birdTarget, cricketPresence, daylight, lapseDetail, lapseRush, riverMix } from './ambience-model';
import { birdSong, songLength, SPECIES, SPECIES_RANGE } from './birdsong';
import { makeRandom } from './dsp';

describe('seasons and day', () => {
  it('silences birds in winter and at night', () => {
    expect(birdSeason(0.02)).toBe(0); // January
    expect(birdSeason(0.95)).toBe(0); // December
    expect(birdSeason(0.38)).toBe(1); // May
    expect(birdTarget(1, 0.38, 1, 0, 4)).toBe(0); // night
    expect(birdTarget(1, 0.02, 0, 0, 4)).toBe(0); // winter
    expect(birdTarget(1, 0.38, 0, 0, 4)).toBe(4);
    expect(birdTarget(0, 0.38, 0, 0, 4)).toBe(0);
  });

  it('brings birds back gradually as presence rises', () => {
    const counts = [0, 0.2, 0.4, 0.6, 0.8, 1].map((b) => birdTarget(b, 0.4, 0, 0, 4));
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1] as number);
    expect(counts[0]).toBe(0);
    expect(counts[5]).toBe(4);
  });

  it('puts crickets on summer nights only', () => {
    expect(cricketPresence(1, 0.55)).toBeGreaterThan(0.9); // July night
    expect(cricketPresence(0, 0.55)).toBe(0); // July day
    expect(cricketPresence(1, 0.1)).toBe(0); // February night
    expect(daylight(0)).toBe(1);
    expect(daylight(1)).toBe(0);
  });

  it('thins detail into a rush as time-lapse rises', () => {
    expect(lapseDetail(0)).toBe(1);
    expect(lapseDetail(1)).toBe(0);
    expect(lapseRush(0)).toBe(0);
    expect(lapseRush(1)).toBe(1);
    expect(birdTarget(1, 0.4, 0, 1, 4)).toBe(0);
  });
});

describe('river mix', () => {
  it('is silent at zero and grows heavier and brighter with flow', () => {
    const dry = riverMix(0);
    expect(dry.rumble + dry.body + dry.hiss + dry.babble + dry.bubbles).toBe(0);
    const calm = riverMix(0.25);
    const flood = riverMix(1);
    expect(flood.rumble / calm.rumble).toBeGreaterThan(4);
    expect(flood.body).toBeGreaterThan(calm.body);
    expect(flood.hiss).toBeGreaterThan(calm.hiss);
    expect(flood.rumbleHz).toBeGreaterThan(calm.rumbleHz);
    expect(flood.bodyHz).toBeGreaterThan(calm.bodyHz);
    // Bubbles and babble belong to the calm stream; the flood drowns them.
    expect(flood.bubbles).toBeLessThan(calm.bubbles);
    expect(flood.babble).toBeLessThan(calm.babble);
  });
});

describe('bird songs', () => {
  it('keeps every species in its range and its songs short', () => {
    const rnd = makeRandom(3);
    for (const s of SPECIES) {
      const [lo, hi] = SPECIES_RANGE[s];
      for (let k = 0; k < 30; k++) {
        const song = birdSong(s, rnd, 0.94 + rnd() * 0.12, 0.9 + rnd() * 0.2);
        expect(song.length).toBeGreaterThan(0);
        expect(songLength(song)).toBeLessThan(4);
        let t = -1;
        for (const syl of song) {
          for (const f of [syl.f0, syl.fMid, syl.f1]) {
            expect(f).toBeGreaterThanOrEqual(lo);
            expect(f).toBeLessThanOrEqual(hi);
          }
          expect(syl.dur).toBeGreaterThan(0.02);
          expect(syl.amp).toBeGreaterThan(0);
          expect(syl.amp).toBeLessThanOrEqual(1);
          expect(syl.t).toBeGreaterThanOrEqual(t);
          t = syl.t;
        }
      }
    }
  });

  it('gives two individuals of a species different voices', () => {
    const a = birdSong('hoopoe', makeRandom(1), 0.95);
    const b = birdSong('hoopoe', makeRandom(1), 1.05);
    expect(a[0]?.f0).not.toBeCloseTo(b[0]?.f0 ?? 0, 0);
  });
});
