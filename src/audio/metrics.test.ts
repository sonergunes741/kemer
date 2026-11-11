import { describe, expect, it } from 'vitest';
import { analyze, fft } from './metrics';

const SR = 48000;

function sine(freq: number, seconds: number, amp = 1): Float32Array {
  const out = new Float32Array(Math.round(SR * seconds));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
}

describe('metrics', () => {
  it('reads BS.1770 loudness of a full-scale 997 Hz sine', () => {
    const s = sine(997, 3);
    // One channel: -3.01 LUFS; the same in both channels sums to about 0.
    expect(analyze([s], SR).lufsM).toBeCloseTo(-3.01, 1);
    expect(analyze([s, s], SR).lufsI).toBeCloseTo(0, 1);
    expect(analyze([s], SR).peakDb).toBeCloseTo(0, 2);
  });

  it('halving the amplitude lowers loudness by 6 dB', () => {
    const a = analyze([sine(997, 2)], SR).lufsM;
    const b = analyze([sine(997, 2, 0.5)], SR).lufsM;
    expect(a - b).toBeCloseTo(6.02, 1);
  });

  it('finds the centroid of a pure tone', () => {
    expect(analyze([sine(1000, 1)], SR).centroidHz).toBeGreaterThan(950);
    expect(analyze([sine(1000, 1)], SR).centroidHz).toBeLessThan(1050);
    expect(analyze([sine(200, 1)], SR).centroidHz).toBeLessThan(analyze([sine(3000, 1)], SR).centroidHz);
  });

  it('measures how long a decay stays within 30 dB', () => {
    const s = sine(500, 3);
    // T60 of 1 s: down 30 dB after 0.5 s.
    for (let i = 0; i < s.length; i++) s[i] = (s[i] as number) * Math.exp((-6.9078 * i) / SR);
    expect(analyze([s], SR).duration).toBeGreaterThan(0.45);
    expect(analyze([s], SR).duration).toBeLessThan(0.56);
  });

  it('reports silence as very quiet, not as NaN', () => {
    const m = analyze([new Float32Array(SR)], SR);
    expect(m.lufsM).toBeLessThan(-100);
    expect(Number.isFinite(m.centroidHz)).toBe(true);
    expect(m.duration).toBe(0);
  });

  it('transforms an impulse to a flat spectrum', () => {
    const re = new Float64Array(8);
    const im = new Float64Array(8);
    re[0] = 1;
    fft(re, im);
    for (let k = 0; k < 8; k++) expect(Math.hypot(re[k] as number, im[k] as number)).toBeCloseTo(1, 9);
  });
});
