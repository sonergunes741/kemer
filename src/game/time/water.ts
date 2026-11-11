/**
 * The river through the years: an annual hydrograph that swells towards the site's usual flood
 * day and settles to a gently breathing mean when time runs fast, and the water of one flood as it
 * rises, peaks and falls (level, speed, silt, roughness and the heap upstream of the bridge).
 */
import type { WaterState } from '../../core/contracts';
import { clamp01, lerp, smoothstep } from '../../core/math';
import type { ChronicleEvent, LevelDef } from '../../core/types';
import { calmWater } from '../scene';

type FloodEvent = Extract<ChronicleEvent, { kind: 'flood' }>;

/** Width of the spring swell, as a fraction of the year. */
const SWELL = 0.07;
/** Share of the two-year flood stage the river reaches on an ordinary year's peak. */
const ANNUAL = 0.32;

function swellAt(season: number, peak: number): number {
  let d = Math.abs(season - peak);
  d = Math.min(d, 1 - d);
  return Math.exp(-((d / SWELL) ** 2));
}

/**
 * The ordinary river. With `lapse` towards 1 (years flying by) the swell blurs into the year's mean
 * plus a slow breathing, so the water does not flicker with every passing spring.
 */
export function annualWater(level: LevelDef, year: number, season: number, lapse: number): WaterState {
  const calm = calmWater(level);
  const stage2 = level.site.flood.stage2;
  const peak = level.site.flood.peakDay / 365;
  const real = ANNUAL * stage2 * swellAt(season, peak);
  const mean = ANNUAL * stage2 * (0.13 + 0.06 * Math.sin(year * 0.61) * Math.sin(year * 0.17));
  const h = lerp(real, mean, smoothstep(0.2, 0.9, lapse));
  const k = clamp01(h / Math.max(0.3, stage2));
  return { level: h, speed: calm.speed * (1 + 0.9 * k), turbidity: calm.turbidity + 0.35 * k, rough: calm.rough + 0.25 * k, heap: 0 };
}

/** The water of one flood at envelope `e` (0 = the ordinary river, 1 = the peak). */
export function floodWater(flood: FloodEvent, e: number, base: WaterState): WaterState {
  const k = clamp01(e);
  const silt = clamp01(0.55 + 0.45 * flood.drama + 0.3 * flood.debris);
  return {
    level: lerp(base.level, flood.level, k),
    speed: lerp(base.speed, Math.max(base.speed, flood.velocity), k),
    turbidity: lerp(base.turbidity, Math.max(base.turbidity, silt), k),
    rough: lerp(base.rough, Math.max(base.rough, 0.45 + 0.5 * flood.drama), k),
    heap: lerp(0, Math.max(0, flood.level - flood.stage), k),
  };
}

/** Rise, hold and fall of a flood over `seconds`: 0..1 at time t. */
export function floodEnvelope(t: number, seconds: number): number {
  const rise = seconds * 0.34;
  const fall = seconds * 0.36;
  if (t < rise) return smoothstep(0, rise, t);
  if (t < seconds - fall) return 1;
  return 1 - smoothstep(seconds - fall, seconds, t);
}

/** A flood of the fast years, seen in passing: the river swells and falls back within two seconds. */
export class Swell {
  private t = 0;

  constructor(private readonly peak: number) {}

  /** The year's water with the swell on it, `dt` later; null once it has passed. */
  over(water: WaterState, dt: number): WaterState | null {
    this.t += dt;
    const t = this.t;
    const e = t < 0.5 ? t / 0.5 : Math.max(0, 1 - (t - 0.5) / 1.1);
    if (e <= 0 && t > 0.5) return null;
    return { ...water, level: Math.max(water.level, this.peak * e * 0.85), turbidity: Math.max(water.turbidity, 0.7 * e), rough: Math.max(water.rough, 0.6 * e) };
  }
}