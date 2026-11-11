/** Small, allocation-free numeric helpers shared by every module. */

export const TAU = Math.PI * 2;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Inverse of lerp; returns 0 when a === b. Not clamped. */
export function invLerp(a: number, b: number, x: number): number {
  const d = b - a;
  return d === 0 ? 0 : (x - a) / d;
}

/** Map x from [a0, a1] to [b0, b1], clamped to the output range by default. */
export function remap(x: number, a0: number, a1: number, b0: number, b1: number, clampResult = true): number {
  const t = invLerp(a0, a1, x);
  return lerp(b0, b1, clampResult ? clamp01(t) : t);
}

/** Hermite smoothstep (GLSL semantics, edges may be in either order). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01(invLerp(edge0, edge1, x));
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01(invLerp(edge0, edge1, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** GLSL fract: x - floor(x), always in [0, 1). */
export function fract(x: number): number {
  return x - Math.floor(x);
}

/**
 * Frame-rate independent exponential approach towards a target.
 * `lambda` is the rate in 1/s: after 1/lambda seconds ~63 % of the gap is closed.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(target, current, Math.exp(-lambda * dt));
}

/** Shortest-path angular damp (radians). */
export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  const delta = wrapAngle(target - current);
  return current + delta * (1 - Math.exp(-lambda * dt));
}

/** Move towards a target by at most maxDelta. */
export function approach(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

/** Wrap an angle to [-π, π). */
export function wrapAngle(a: number): number {
  let x = (a + Math.PI) % TAU;
  if (x < 0) x += TAU;
  return x - Math.PI;
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

export function easeInCubic(t: number): number {
  const c = clamp01(t);
  return c * c * c;
}

export function easeInOutCubic(t: number): number {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

export function easeOutQuart(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u * u;
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
}

/** Exponential ease-out for "settling" motions (no overshoot). */
export function easeOutExpo(t: number): number {
  const c = clamp01(t);
  return c === 1 ? 1 : 1 - Math.pow(2, -10 * c);
}

/** True for finite numbers (rejects NaN, ±Infinity and non-numbers). */
export function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Replace a non-finite value with a fallback. */
export function finiteOr(x: number, fallback: number): number {
  return Number.isFinite(x) ? x : fallback;
}

/** Cents between two frequencies (b relative to a). */
export function cents(a: number, b: number): number {
  return a > 0 && b > 0 ? 1200 * Math.log2(b / a) : 0;
}

/** Decibels to linear gain and back. */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  return gain > 0 ? 20 * Math.log10(gain) : -Infinity;
}
