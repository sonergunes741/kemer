/**
 * What a moment of the year looks like, as a handful of numbers the shaders read: how much leaf
 * is on the trees and what colour, how much snow, how green the grass is. Pure functions plus a
 * low-pass filter: when years fly by at time-lapse pace the filter folds the seasons into their
 * average instead of strobing through them.
 */
import { clamp01, smoothstep } from '../../core/math';

export interface SeasonLook {
  /** 0 bare .. 1 full canopy (deciduous trees). */
  leaf: number;
  /** 0 summer green .. 1 full autumn colour. */
  autumn: number;
  /** 0..1 blossom on the fruit trees (early spring). */
  bloom: number;
  /** Grass weights for the four season colours; they sum to 1. */
  spring: number;
  summer: number;
  fall: number;
  winter: number;
  /** 0..1 snow lying on open ground. */
  snow: number;
}

export interface Climate {
  /** EnvDef.winter: how hard the winters are. */
  readonly winter: number;
  /** EnvDef.wet: rainfall. */
  readonly wet: number;
  /** Arid places brown off in high summer. */
  readonly arid: number;
}

/**
 * A bump that is 1 between b and c and fades to 0 at a and d, on the year circle. Edges must be
 * ascending; a window across New Year is written with c and d above 1.
 */
function window(s: number, a: number, b: number, c: number, d: number): number {
  const t = ((s % 1) + 1) % 1;
  const f = (x: number): number => smoothstep(a, b, x) * (1 - smoothstep(c, d, x));
  return Math.max(f(t), f(t + 1), f(t - 1));
}

export function seasonLook(season: number, climate: Climate, out?: SeasonLook): SeasonLook {
  const s = ((season % 1) + 1) % 1;
  const o = out ?? { leaf: 0, autumn: 0, bloom: 0, spring: 0, summer: 0, fall: 0, winter: 0, snow: 0 };
  // Leaves: bud break early April, full by the end of the month, colour in October, gone by late
  // November. The game's spring afternoon (season 0.33) must find the crowns full: half-leafed
  // trees are a scatter of single cards, and they read as confetti, not as trees.
  o.leaf = window(s, 0.24, 0.315, 0.8, 0.9);
  o.autumn = smoothstep(0.7, 0.82, s) * (1 - smoothstep(0.92, 0.98, s));
  // Orchard blossom: a short week or two before the leaves.
  o.bloom = window(s, 0.21, 0.24, 0.265, 0.3);
  // Grass weights, cyclic and normalised.
  let sp = window(s, 0.2, 0.3, 0.42, 0.5);
  let su = window(s, 0.42, 0.52, 0.66, 0.76);
  let fa = window(s, 0.66, 0.76, 0.86, 0.94);
  let wi = window(s, 0.86, 0.96, 1.15, 1.25);
  // Arid places spend less of the year green.
  sp *= 1 - climate.arid * 0.35;
  su += climate.arid * 0.15 * sp;
  const sum = sp + su + fa + wi || 1;
  sp /= sum;
  su /= sum;
  fa /= sum;
  wi /= sum;
  o.spring = sp;
  o.summer = su;
  o.fall = fa;
  o.winter = wi;
  // Snow: centred on mid January; harder winters keep it longer.
  const w = clamp01(climate.winter);
  const half = 0.02 + w * 0.13;
  const centre = 0.04;
  let d = Math.abs(s - centre);
  d = Math.min(d, 1 - d);
  o.snow = w <= 0.05 ? 0 : (1 - smoothstep(half * 0.6, half, d)) * clamp01(0.35 + w);
  return o;
}

const KEYS: (keyof SeasonLook)[] = ['leaf', 'autumn', 'bloom', 'spring', 'summer', 'fall', 'winter', 'snow'];

/**
 * Low-pass the look. `tau` seconds of memory: invisible at real-time pace, an average of several
 * years once the time-lapse runs at years per second.
 */
export function blendLook(current: SeasonLook, target: SeasonLook, dt: number, tau: number): void {
  const k = tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
  for (const key of KEYS) current[key] += (target[key] - current[key]) * k;
}

/** Precipitation the climate brings on its own at this point of the year: rain and snow, 0..1. */
export function climateWeather(season: number, year: number, climate: Climate): { rain: number; snow: number } {
  // A slow, deterministic "weather of the day": a few wet days, the rest dry.
  const day = Math.floor(year * 365 + season * 365);
  const r = Math.abs(Math.sin(day * 12.9898) * 43758.5453) % 1;
  const wetSeason = window(season, 0.15, 0.25, 0.4, 0.5) * 0.7 + window(season, 0.75, 0.82, 0.95, 1.0) * 0.6 + 0.15;
  const chance = clamp01(climate.wet * wetSeason * 0.6);
  const falls = r < chance ? clamp01((chance - r) / Math.max(chance, 1e-3) + 0.2) : 0;
  const cold = seasonLook(season, climate).snow > 0.3;
  return cold ? { rain: 0, snow: falls } : { rain: falls, snow: 0 };
}
