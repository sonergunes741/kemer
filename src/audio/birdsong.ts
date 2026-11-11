/**
 * Bird songs as lists of synthesized syllables: a sine whose pitch glides through three points,
 * optionally trilled by a fast frequency modulation. Five species-like voices of an Anatolian
 * valley, each individual with its own pitch and tempo. Pure (the random source is passed in).
 */

export type Species = 'oriole' | 'warbler' | 'sparrow' | 'hoopoe' | 'tit';

export const SPECIES: readonly Species[] = ['oriole', 'warbler', 'sparrow', 'hoopoe', 'tit'];

export interface Syllable {
  /** Seconds from the song start. */
  readonly t: number;
  readonly dur: number;
  /** Pitch at the start, the middle and the end, Hz. */
  readonly f0: number;
  readonly fMid: number;
  readonly f1: number;
  /** Trill: modulation rate (Hz) and depth (fraction of the pitch). */
  readonly fm: number;
  readonly fmDepth: number;
  /** 0..1. */
  readonly amp: number;
}

/** Frequency range each species may use (tests check every syllable against it). */
export const SPECIES_RANGE: Readonly<Record<Species, readonly [number, number]>> = {
  oriole: [1100, 3400],
  warbler: [2800, 7200],
  sparrow: [2400, 5600],
  hoopoe: [380, 640],
  tit: [2600, 5200],
};

/** Relative output gain per species: low hoopoe calls need more level to be heard at all. */
export const SPECIES_GAIN: Readonly<Record<Species, number>> = {
  oriole: 0.55,
  warbler: 0.3,
  sparrow: 0.32,
  hoopoe: 0.75,
  tit: 0.3,
};

type Rnd = () => number;
const rr = (rnd: Rnd, a: number, b: number): number => a + (b - a) * rnd();
const int = (rnd: Rnd, a: number, b: number): number => a + Math.floor(rnd() * (b - a + 1));

function syl(t: number, dur: number, f0: number, fMid: number, f1: number, amp: number, fm = 0, fmDepth = 0): Syllable {
  return { t, dur, f0, fMid, f1, fm, fmDepth, amp };
}

/** Golden-oriole-like: a short fluting phrase of gliding whistles. */
function oriole(rnd: Rnd, p: number, k: number): Syllable[] {
  const base = rr(rnd, 1450, 1850) * p;
  const n = int(rnd, 3, 5);
  const out: Syllable[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const up = rnd() < 0.5;
    const a = base * rr(rnd, 0.95, 1.35);
    const b = base * rr(rnd, 1.15, 1.6);
    const c = up ? b * rr(rnd, 1.0, 1.08) : base * rr(rnd, 0.85, 1.05);
    const dur = rr(rnd, 0.09, 0.2) * k;
    out.push(syl(t, dur, a, b, c, rr(rnd, 0.7, 1)));
    t += dur + rr(rnd, 0.015, 0.06) * k;
  }
  return out;
}

/** Warbler-like: a rapid trill of falling elements, sometimes a second, higher motif. */
function warbler(rnd: Rnd, p: number, k: number): Syllable[] {
  const out: Syllable[] = [];
  let t = 0;
  const motifs = rnd() < 0.5 ? 1 : 2;
  for (let m = 0; m < motifs; m++) {
    const f = rr(rnd, 4000, 5400) * p * (m === 1 ? 1.12 : 1);
    const n = int(rnd, 5, 11);
    const dur = rr(rnd, 0.032, 0.05) * k;
    const gap = rr(rnd, 0.014, 0.026) * k;
    for (let i = 0; i < n; i++) {
      const fade = 0.6 + 0.4 * Math.sin((Math.PI * (i + 0.5)) / n);
      out.push(syl(t, dur, f * 1.08, f, f * 0.84, fade * 0.8, rr(rnd, 0, 1) < 0.3 ? 60 : 0, 0.04));
      t += dur + gap;
    }
    t += rr(rnd, 0.08, 0.16) * k;
  }
  return out;
}

/** Sparrow-like: a few irregular arched chirps. */
function sparrow(rnd: Rnd, p: number, k: number): Syllable[] {
  const n = int(rnd, 2, 5);
  const out: Syllable[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const f = rr(rnd, 3100, 3600) * p;
    const dur = rr(rnd, 0.06, 0.1) * k;
    out.push(syl(t, dur, f, f * rr(rnd, 1.2, 1.38), f * rr(rnd, 0.86, 0.98), rr(rnd, 0.6, 0.95), 85, 0.025));
    t += dur + rr(rnd, 0.1, 0.32) * k;
  }
  return out;
}

/** Hoopoe-like (ibibik): two to four soft, hollow "hoo" notes on one pitch. */
function hoopoe(rnd: Rnd, p: number, k: number): Syllable[] {
  const f = rr(rnd, 470, 530) * p;
  const n = rnd() < 0.7 ? 3 : rnd() < 0.5 ? 2 : 4;
  const out: Syllable[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const dur = 0.11 * k;
    out.push(syl(t, dur, f * 1.01, f, f * 0.96, 0.9));
    t += dur + 0.17 * k;
  }
  return out;
}

/** Great-tit-like: "tea-cher" pairs repeated. */
function tit(rnd: Rnd, p: number, k: number): Syllable[] {
  const hi = rr(rnd, 4000, 4500) * p;
  const lo = hi * rr(rnd, 0.7, 0.78);
  const n = int(rnd, 3, 4);
  const out: Syllable[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    out.push(syl(t, 0.085 * k, hi, hi * 0.99, hi * 0.97, 0.75));
    out.push(syl(t + 0.125 * k, 0.075 * k, lo * 1.02, lo, lo * 0.98, 0.65));
    t += 0.3 * k;
  }
  return out;
}

/**
 * One song. `pitch` and `tempo` belong to the individual bird (about 0.94..1.06) so that two birds
 * of a species are never the same.
 */
export function birdSong(species: Species, rnd: Rnd, pitch = 1, tempo = 1): Syllable[] {
  const k = 1 / Math.max(0.5, tempo);
  switch (species) {
    case 'oriole':
      return oriole(rnd, pitch, k);
    case 'warbler':
      return warbler(rnd, pitch, k);
    case 'sparrow':
      return sparrow(rnd, pitch, k);
    case 'hoopoe':
      return hoopoe(rnd, pitch, k);
    case 'tit':
      return tit(rnd, pitch, k);
  }
}

export function songLength(song: readonly Syllable[]): number {
  let end = 0;
  for (const s of song) end = Math.max(end, s.t + s.dur);
  return end;
}
