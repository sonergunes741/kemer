import { describe, expect, it } from 'vitest';
import { crowdGain, RateLimiter, VariantPicker, VoicePool } from './voices';

describe('VoicePool', () => {
  it('grants voices up to its size', () => {
    const pool = new VoicePool(3);
    expect(pool.acquire(0.5, 0, 1)?.steal).toBeNull();
    expect(pool.acquire(0.5, 0, 1)?.steal).toBeNull();
    expect(pool.acquire(0.5, 0, 1)?.steal).toBeNull();
    expect(pool.active(0)).toBe(3);
  });

  it('steals the least important voice for a louder sound, oldest first', () => {
    const pool = new VoicePool(2);
    const a = pool.acquire(0.3, 0, 5);
    const b = pool.acquire(0.3, 0.1, 5);
    const c = pool.acquire(0.9, 0.2, 5);
    expect(c?.steal).toBe(a?.id);
    const d = pool.acquire(0.5, 0.3, 5);
    expect(d?.steal).toBe(b?.id);
    expect(pool.stolen).toBe(2);
    expect(pool.active(0.3)).toBe(2);
  });

  it('drops a sound quieter than everything playing', () => {
    const pool = new VoicePool(1);
    pool.acquire(0.8, 0, 5);
    expect(pool.acquire(0.2, 0.1, 5)).toBeNull();
    expect(pool.dropped).toBe(1);
  });

  it('frees voices when they end', () => {
    const pool = new VoicePool(1);
    pool.acquire(0.8, 0, 0.5);
    expect(pool.acquire(0.1, 0.6, 1)?.steal).toBeNull();
    expect(pool.peak).toBe(1);
  });

  it('keeps a collapse of 400 events within the voice budget', () => {
    const pool = new VoicePool(40);
    for (let i = 0; i < 400; i++) pool.acquire((i % 10) / 10, i * 0.01, 1.2);
    expect(pool.peak).toBe(40);
    expect(pool.active(4)).toBeLessThanOrEqual(40);
    expect(pool.granted + pool.dropped).toBe(400);
  });
});

describe('RateLimiter', () => {
  it('lets a burst through, then holds to the rate', () => {
    const rl = new RateLimiter({ hit: { rate: 10, burst: 3 } });
    const passed = [0, 0, 0, 0, 0].filter(() => rl.allow('hit', 0)).length;
    expect(passed).toBe(3);
    expect(rl.allow('hit', 0.05)).toBe(false);
    expect(rl.allow('hit', 0.11)).toBe(true);
    let n = 0;
    for (let t = 1; t < 2; t += 0.001) if (rl.allow('hit', t)) n++;
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(13);
  });

  it('passes kinds without a rule', () => {
    const rl = new RateLimiter({});
    for (let i = 0; i < 50; i++) expect(rl.allow('anything', 0)).toBe(true);
  });
});

describe('crowd gain and variants', () => {
  it('thins a crowd as 1/sqrt(n) above the comfortable count', () => {
    expect(crowdGain(5, 10)).toBe(1);
    expect(crowdGain(40, 10)).toBeCloseTo(0.5, 6);
  });

  it('never repeats a variant twice in a row', () => {
    const p = new VariantPicker();
    let seed = 1;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let last = -1;
    for (let i = 0; i < 200; i++) {
      const v = p.pick('thud', 3, rnd);
      expect(v).not.toBe(last);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(3);
      last = v;
    }
    expect(p.pick('one', 1, rnd)).toBe(0);
  });
});
