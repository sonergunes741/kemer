/**
 * How the ambience fields become layer levels: pure functions of AmbienceState, unit-tested.
 * Season is the position in the year (0 = 1 January), night 0 = day .. 1 = night.
 */
import { clamp01, smoothstep } from '../core/math';

/** Birds sing from March to late autumn and are silent in winter. */
export function birdSeason(season: number): number {
  const s = season - Math.floor(season);
  return smoothstep(0.16, 0.26, s) * (1 - smoothstep(0.7, 0.88, s));
}

/** Crickets: warm months only (late May to early October). */
export function cricketSeason(season: number): number {
  const s = season - Math.floor(season);
  return smoothstep(0.38, 0.46, s) * (1 - smoothstep(0.68, 0.77, s));
}

export function daylight(night: number): number {
  return 1 - smoothstep(0.25, 0.65, clamp01(night));
}

export function cricketPresence(night: number, season: number): number {
  return smoothstep(0.45, 0.85, clamp01(night)) * cricketSeason(season);
}

/** Detail layers (birds, crickets, bubbles, drops, gusts) thin out as time-lapse rises. */
export function lapseDetail(lapse: number): number {
  return 1 - smoothstep(0.08, 0.7, clamp01(lapse));
}

/** The soft rush that replaces them. */
export function lapseRush(lapse: number): number {
  return smoothstep(0.15, 0.95, clamp01(lapse));
}

/** How many individual birds should be singing (0..max). */
export function birdTarget(birds: number, season: number, night: number, lapse: number, max: number): number {
  const presence = clamp01(birds) * birdSeason(season) * daylight(night) * lapseDetail(lapse);
  return Math.round(presence * max);
}

export interface RiverMix {
  /** Linear gains of the layers. */
  readonly rumble: number;
  readonly body: number;
  readonly hiss: number;
  readonly babble: number;
  /** Bubbles per second. */
  readonly bubbles: number;
  /** Filter corners, Hz. */
  readonly rumbleHz: number;
  readonly bodyHz: number;
  readonly hissHz: number;
}

/**
 * From a murmur (0.25, a calm stream) to a roar (1, a flood): low weight grows fastest, the band
 * of the body rises, the hiss brightens, and the distinct babble and bubbles drown in the mass.
 */
export function riverMix(river: number): RiverMix {
  const r = clamp01(river);
  const calm = 1 - smoothstep(0.45, 0.9, r);
  // Zero is silence (a dry bed); the stream fades in over the first tenth.
  const on = smoothstep(0, 0.1, r);
  return {
    rumble: on * (0.06 + 0.5 * Math.pow(r, 2.2)),
    body: on * (0.13 + 0.17 * Math.pow(r, 1.4)),
    hiss: on * (0.03 + 0.09 * Math.pow(r, 1.3)),
    babble: on * (0.07 + 0.17 * smoothstep(0.05, 0.35, r)) * (0.25 + 0.75 * calm),
    bubbles: r < 0.02 ? 0 : (1.5 + 5 * smoothstep(0.05, 0.3, r)) * calm,
    rumbleHz: 110 + 280 * r,
    bodyHz: 380 + 720 * r,
    hissHz: 2600 - 900 * r,
  };
}
