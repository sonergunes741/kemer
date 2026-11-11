/**
 * Generates short melodic phrases inside a makam: mostly stepwise, leaning on the güçlü, resting
 * on the durak or the güçlü at the end, with a little rubato. Pure (the random source is passed in).
 */
import type { Instrument, MoodProfile } from './moods';
import type { Makam } from './tuning';

export interface Note {
  /** Seconds from the phrase start. */
  readonly t: number;
  /** Scale degree relative to the instrument's own octave. */
  readonly degree: number;
  /** Seconds. */
  readonly dur: number;
  readonly inst: Instrument;
  /** 0..1. */
  readonly vel: number;
}

export interface Phrase {
  readonly notes: readonly Note[];
  /** Seconds from the phrase start to the end of the last note. */
  readonly length: number;
}

type Rnd = () => number;

function weighted<T>(rnd: Rnd, items: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of items) total += Math.max(0, w);
  let x = rnd() * total;
  for (const [item, w] of items) {
    x -= Math.max(0, w);
    if (x <= 0) return item;
  }
  return (items[items.length - 1] as readonly [T, number])[0];
}

function int(rnd: Rnd, lo: number, hi: number): number {
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

/** Folds a degree back inside [lo, hi] (a melody turns at the edge of its range). */
export function reflect(degree: number, lo: number, hi: number): number {
  if (hi <= lo) return lo;
  let d = degree;
  for (let i = 0; i < 4 && (d < lo || d > hi); i++) d = d < lo ? 2 * lo - d : 2 * hi - d;
  return Math.min(hi, Math.max(lo, d));
}

export function pickInstrument(rnd: Rnd, p: MoodProfile): Instrument {
  return weighted<Instrument>(rnd, [
    ['ud', p.weights.ud],
    ['kanun', p.weights.kanun],
    ['ney', p.weights.ney],
  ]);
}

function nearest(options: readonly number[], degree: number): number {
  let best = options[0] ?? degree;
  for (const d of options) if (Math.abs(d - degree) < Math.abs(best - degree)) best = d;
  return best;
}

/** Resting degrees inside the register: durak, güçlü and the upper durak. */
export function restingDegrees(makam: Makam, lo: number, hi: number): number[] {
  const out = [0, makam.guclu, 7, makam.guclu - 7, -7].filter((d) => d >= lo && d <= hi);
  return out.length > 0 ? out : [Math.round((lo + hi) / 2)];
}

export function makePhrase(rnd: Rnd, p: MoodProfile, makam: Makam): Phrase {
  const [lo, hi] = p.register;
  const inst = pickInstrument(rnd, p);
  const n = Math.max(1, int(rnd, p.notes[0], p.notes[1]));
  const rests = restingDegrees(makam, lo, hi);
  const target = rests[Math.floor(rnd() * rests.length)] as number;
  // A phrase starts on the durak or leans in from the güçlü, as a makam's seyir would.
  let degree = reflect(rnd() < 0.55 ? 0 : makam.guclu, lo, hi);
  const ney = inst === 'ney';
  const notes: Note[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const left = n - 1 - i;
    if (i > 0 && last) {
      // The phrase comes to rest: on its target if near, otherwise on the nearest resting degree.
      degree = Math.abs(target - degree) <= 4 ? target : nearest(rests, degree);
    } else if (i > 0) {
      let step: number;
      if (left <= 2 && Math.abs(target - degree) > 0) {
        // Steer home in the last notes.
        step = Math.sign(target - degree) * Math.min(2, Math.abs(target - degree));
      } else if (p.pulse) {
        step = weighted(rnd, [
          [0, 0.35],
          [1, 0.22],
          [-1, 0.25],
          [2, 0.09],
          [-2, 0.09],
        ]);
      } else {
        step = weighted(rnd, [
          [-1, 0.33],
          [1, 0.33],
          [-2, 0.11],
          [2, 0.13],
          [3, 0.04],
          [-3, 0.03],
          [0, 0.03],
        ]);
      }
      degree = reflect(degree + step, lo, hi);
    }
    let beats: number;
    if (p.pulse) beats = last ? 2 : rnd() < 0.85 ? 1 : 2;
    else if (ney) beats = last ? int(rnd, 4, 6) : weighted(rnd, [[2, 0.45], [3, 0.35], [1.5, 0.2]] as const);
    else beats = last ? int(rnd, 3, 4) : weighted(rnd, [[1, 0.45], [1.5, 0.2], [2, 0.25], [0.5, 0.1]] as const);
    const rubato = p.pulse ? 1 + (rnd() - 0.5) * 0.04 : 1 + (rnd() - 0.5) * 0.18;
    const dur = beats * p.beat * rubato;
    const accent = p.pulse && i % 4 === 0 ? 1 : 0.8;
    const vel = Math.min(1, (last ? 0.7 : 0.75 + rnd() * 0.25) * accent + (p.pulse ? 0.1 : 0));
    notes.push({ t, degree, dur, inst, vel });
    t += dur;
  }
  const lastNote = notes[notes.length - 1] as Note;
  return { notes, length: lastNote.t + lastNote.dur };
}

/** One warm chord: a slow strum of durak, güçlü and octave on the ud, the ney holding the güçlü. */
export function makeChord(makam: Makam): Phrase {
  const g = makam.guclu;
  const notes: Note[] = [
    { t: 0, degree: -7, dur: 4, inst: 'ud', vel: 0.75 },
    { t: 0.07, degree: g - 7, dur: 4, inst: 'ud', vel: 0.7 },
    { t: 0.14, degree: 0, dur: 4, inst: 'ud', vel: 0.8 },
    { t: 0.45, degree: g - 7, dur: 4.5, inst: 'ney', vel: 0.6 },
  ];
  return { notes, length: 5 };
}
