import { describe, expect, it } from 'vitest';
import { Glide, hitAt, scheduleHit, scheduleSwell, swellAt, tauFor, type ParamLike } from './envelope';

class Recorder implements ParamLike {
  calls: string[] = [];
  setValueAtTime(v: number, t: number): void {
    this.calls.push(`set ${v} @${t}`);
  }
  linearRampToValueAtTime(v: number, t: number): void {
    this.calls.push(`lin ${v} @${t}`);
  }
  setTargetAtTime(v: number, t: number, k: number): void {
    this.calls.push(`target ${v} @${t} k${k.toFixed(4)}`);
  }
  cancelScheduledValues(t: number): void {
    this.calls.push(`cancel @${t}`);
  }
}

describe('envelopes', () => {
  it('tauFor gives a 60 dB fall over t60', () => {
    expect(Math.exp(-1 / tauFor(1))).toBeCloseTo(0.001, 6);
  });

  it('a hit rises linearly, holds, then falls by 60 dB over its decay', () => {
    const env = { attack: 0.01, hold: 0.02, decay: 0.5 };
    expect(hitAt(env, 1, 0, -0.1)).toBe(0);
    expect(hitAt(env, 1, 0, 0.005)).toBeCloseTo(0.5, 6);
    expect(hitAt(env, 1, 0, 0.02)).toBe(1);
    expect(hitAt(env, 1, 0, 0.03 + 0.5)).toBeCloseTo(0.001, 5);
  });

  it('scheduleHit writes the same shape and returns when it is silent', () => {
    const r = new Recorder();
    const end = scheduleHit(r, 2, { attack: 0.01, decay: 0.5 }, 0.8);
    expect(end).toBeCloseTo(2.51, 6);
    expect(r.calls[0]).toBe('set 0 @2');
    expect(r.calls[1]).toBe('lin 0.8 @2.01');
    expect(r.calls[2]).toMatch(/^target 0 @2.01/);
  });

  it('a swell approaches its peak and releases after the note', () => {
    const env = { attack: 0.3, release: 0.4 };
    const a = swellAt(env, 1, 0, 1, 0.1);
    const b = swellAt(env, 1, 0, 1, 0.3);
    const c = swellAt(env, 1, 0, 1, 0.9);
    expect(a).toBeLessThan(b);
    expect(b).toBeGreaterThan(0.9);
    expect(c).toBeGreaterThan(0.99);
    expect(swellAt(env, 1, 0, 1, 1.8)).toBeLessThan(0.01);
    const r = new Recorder();
    expect(scheduleSwell(r, 0, 1, env, 1)).toBeCloseTo(1.8, 6);
  });

  it('Glide skips targets that have not moved', () => {
    const r = new Recorder();
    const g = new Glide(r);
    g.to(0.5, 0, 0.1);
    g.to(0.5, 0.1, 0.1);
    g.to(0.5005, 0.2, 0.1);
    g.to(0.6, 0.3, 0.1);
    g.to(Number.NaN, 0.4, 0.1);
    expect(r.calls).toHaveLength(2);
    expect(g.target).toBe(0.6);
  });
});
