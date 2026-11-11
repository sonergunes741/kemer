/**
 * What each music mood is made of. Pure data: the music engine reads it, the tests check it.
 * Sparse by design: a few notes, then long rests in which the river carries the scene.
 */
import type { MusicMood } from '../core/contracts';
import type { MakamId } from './tuning';

export type Instrument = 'ud' | 'kanun' | 'ney';

export interface MoodProfile {
  /** A fixed makam, or the colour of the current region. */
  readonly makam: MakamId | 'region';
  /** Output gain of the mood (linear). */
  readonly level: number;
  /** Drone level 0..1 (0 = no drone). */
  readonly drone: number;
  /** Whether the drone adds the güçlü above the tonic. */
  readonly droneFifth: boolean;
  /** Relative chance of each instrument leading a phrase; all zero means no phrases. */
  readonly weights: Readonly<Record<Instrument, number>>;
  /** Notes per phrase, inclusive. */
  readonly notes: readonly [number, number];
  /** Seconds per beat; note lengths are counted in beats. */
  readonly beat: number;
  /** Silence between phrases, seconds. */
  readonly rest: readonly [number, number];
  /** Silence before the first phrase, seconds. */
  readonly firstDelay: readonly [number, number];
  /** Scale degrees the melody moves within (relative to the instrument's own octave). */
  readonly register: readonly [number, number];
  /** Reverb send of the mood, 0..1. */
  readonly wet: number;
  /** Opens with one warm chord (the arch stood). */
  readonly chord?: boolean;
  /** Even pulses instead of free rhythm (gentle momentum while building). */
  readonly pulse?: boolean;
}

const QUIET: MoodProfile = {
  makam: 'region',
  level: 0,
  drone: 0,
  droneFifth: false,
  weights: { ud: 0, kanun: 0, ney: 0 },
  notes: [0, 0],
  beat: 1,
  rest: [10, 10],
  firstDelay: [1, 1],
  register: [0, 7],
  wet: 0.3,
};

export const MOODS: Readonly<Record<MusicMood, MoodProfile>> = {
  none: QUIET,
  title: {
    makam: 'huseyni',
    level: 0.9,
    drone: 0.5,
    droneFifth: true,
    weights: { ud: 0.3, kanun: 0.15, ney: 0.55 },
    notes: [2, 5],
    beat: 0.75,
    rest: [6, 11],
    firstDelay: [1.5, 2.5],
    register: [0, 9],
    wet: 0.45,
  },
  survey: {
    makam: 'region',
    level: 0.85,
    drone: 0.45,
    droneFifth: true,
    weights: { ud: 0.5, kanun: 0.2, ney: 0.3 },
    notes: [3, 6],
    beat: 0.55,
    rest: [5, 10],
    firstDelay: [1, 2],
    register: [-2, 8],
    wet: 0.4,
  },
  design: {
    makam: 'region',
    level: 0.8,
    drone: 0.3,
    droneFifth: false,
    weights: { ud: 0.3, kanun: 0.6, ney: 0.1 },
    notes: [1, 4],
    beat: 0.6,
    rest: [8, 15],
    firstDelay: [2, 4],
    register: [0, 9],
    wet: 0.45,
  },
  build: {
    makam: 'region',
    level: 0.75,
    drone: 0.4,
    droneFifth: true,
    weights: { ud: 0.75, kanun: 0.25, ney: 0 },
    notes: [4, 7],
    beat: 0.42,
    rest: [3, 6],
    firstDelay: [0.8, 1.6],
    register: [-3, 5],
    wet: 0.3,
    pulse: true,
  },
  hush: { ...QUIET, level: 0.5, drone: 0.45, wet: 0.5 },
  relief: {
    makam: 'region',
    level: 0.85,
    drone: 0.45,
    droneFifth: true,
    weights: { ud: 0.45, kanun: 0.15, ney: 0.4 },
    notes: [2, 4],
    beat: 0.8,
    rest: [8, 14],
    firstDelay: [7, 10],
    register: [0, 8],
    wet: 0.5,
    chord: true,
  },
  time: {
    makam: 'region',
    level: 0.9,
    drone: 0.55,
    droneFifth: true,
    weights: { ud: 0.15, kanun: 0.25, ney: 0.6 },
    notes: [2, 5],
    beat: 0.95,
    rest: [8, 16],
    firstDelay: [2, 4],
    register: [0, 9],
    wet: 0.55,
  },
  peril: {
    makam: 'hicaz',
    level: 0.8,
    drone: 0.6,
    droneFifth: false,
    weights: { ud: 0.8, kanun: 0, ney: 0.2 },
    notes: [3, 6],
    beat: 0.36,
    rest: [2.5, 5],
    firstDelay: [0.5, 1],
    register: [-4, 4],
    wet: 0.35,
  },
  elegy: {
    makam: 'saba',
    level: 0.8,
    drone: 0.4,
    droneFifth: false,
    weights: { ud: 0.2, kanun: 0, ney: 0.8 },
    notes: [2, 4],
    beat: 1.0,
    rest: [7, 13],
    firstDelay: [3.5, 5],
    register: [-1, 7],
    wet: 0.55,
  },
  legacy: {
    makam: 'region',
    level: 0.85,
    drone: 0.5,
    droneFifth: true,
    weights: { ud: 0.4, kanun: 0.3, ney: 0.3 },
    notes: [3, 6],
    beat: 0.65,
    rest: [5, 9],
    firstDelay: [1, 2],
    register: [0, 9],
    wet: 0.45,
  },
};

/** True when a mood plays melodic phrases (and not only a drone or nothing). */
export function hasPhrases(p: MoodProfile): boolean {
  return p.notes[1] > 0 && p.weights.ud + p.weights.kanun + p.weights.ney > 0;
}
