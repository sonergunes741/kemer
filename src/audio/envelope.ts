/**
 * Envelopes as AudioParam automation. Each scheduling function has a pure twin (`*At`) that
 * computes the same curve, so the shapes are unit-tested without Web Audio.
 */
import { LN1000 } from './dsp';

/** The subset of AudioParam we automate (structural, so tests can pass a recorder). */
export interface ParamLike {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(target: number, time: number, timeConstant: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

/** Time constant of an exponential that falls by 60 dB in `t60` seconds. */
export function tauFor(t60: number): number {
  return Math.max(1e-4, t60) / LN1000;
}

/** A struck sound: linear attack, optional hold, then exponential decay to silence. */
export interface Hit {
  readonly attack: number;
  readonly hold?: number;
  /** Seconds to fall by 60 dB after the hold. */
  readonly decay: number;
}

/** Schedules a hit on `param` from `t0`; returns when it is effectively silent. */
export function scheduleHit(param: ParamLike, t0: number, env: Hit, peak: number): number {
  const a = Math.max(0.0005, env.attack);
  const h = Math.max(0, env.hold ?? 0);
  param.setValueAtTime(0, t0);
  param.linearRampToValueAtTime(peak, t0 + a);
  if (h > 0) param.setValueAtTime(peak, t0 + a + h);
  param.setTargetAtTime(0, t0 + a + h, tauFor(env.decay));
  return t0 + a + h + env.decay;
}

/** Value of `scheduleHit` at time t (the pure twin). */
export function hitAt(env: Hit, peak: number, t0: number, t: number): number {
  const a = Math.max(0.0005, env.attack);
  const h = Math.max(0, env.hold ?? 0);
  const dt = t - t0;
  if (dt <= 0) return 0;
  if (dt < a) return (peak * dt) / a;
  if (dt < a + h) return peak;
  return peak * Math.exp(-(dt - a - h) / tauFor(env.decay));
}

/** A held note: exponential approach to `peak` (attack = time to ~95 %), held, then released. */
export interface Swell {
  readonly attack: number;
  readonly release: number;
}

export function scheduleSwell(param: ParamLike, t0: number, dur: number, env: Swell, peak: number): number {
  const tauA = Math.max(0.002, env.attack) / 3;
  const off = t0 + Math.max(dur, env.attack * 0.5);
  param.setValueAtTime(0, t0);
  param.setTargetAtTime(peak, t0, tauA);
  param.setTargetAtTime(0, off, Math.max(0.005, env.release) / 3);
  return off + env.release * 2;
}

export function swellAt(env: Swell, peak: number, t0: number, dur: number, t: number): number {
  const tauA = Math.max(0.002, env.attack) / 3;
  const off = t0 + Math.max(dur, env.attack * 0.5);
  if (t <= t0) return 0;
  const rising = peak * (1 - Math.exp(-(Math.min(t, off) - t0) / tauA));
  if (t <= off) return rising;
  return rising * Math.exp(-(t - off) / (Math.max(0.005, env.release) / 3));
}

/**
 * Glides a parameter towards a target, skipping the call when the target has not moved enough:
 * ambience layers call this every frame and must not flood the automation timeline.
 */
export class Glide {
  private last = Number.NaN;
  constructor(
    private readonly param: ParamLike,
    private readonly epsilon = 0.002,
  ) {}

  to(value: number, now: number, tau: number): void {
    if (!Number.isFinite(value)) return;
    if (Math.abs(value - this.last) <= this.epsilon * Math.max(1, Math.abs(value))) return;
    this.last = value;
    this.param.setTargetAtTime(value, now, Math.max(0.005, tau));
  }

  /** Jump (with a few ms of smoothing so it never clicks). */
  set(value: number, now: number): void {
    this.last = value;
    this.param.cancelScheduledValues(now);
    this.param.setTargetAtTime(value, now, 0.01);
  }

  get target(): number {
    return this.last;
  }
}
