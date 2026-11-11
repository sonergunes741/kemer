import { describe, expect, it } from 'vitest';
import { allFinite, makeRandom, peakOf, pinkNoise, seamlessLoop } from './dsp';
import { cricketLoop, footstep, hoof } from './gen-life';
import { KANUN, pluckTuning, renderPluck, UD } from './gen-pluck';
import { chiselTap, jointCrack, keystoneBoom, stoneThud } from './gen-stone';
import { rainLoop, splash } from './gen-water';
import { malletWedge, timberCreak } from './gen-wood';
import { valleyImpulse } from './impulse';
import { analyze } from './metrics';
import { faderGain, softClipCurve } from './mixer';
import { place } from './player';

const SR = 48000;

/** Strength of a frequency in a signal (windowed single-bin DFT). */
function strength(x: Float32Array, f: number, from: number, len: number): number {
  let re = 0;
  let im = 0;
  for (let i = 0; i < len; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1));
    const v = (x[from + i] as number) * w;
    re += v * Math.cos((2 * Math.PI * f * i) / SR);
    im -= v * Math.sin((2 * Math.PI * f * i) / SR);
  }
  return Math.hypot(re, im);
}

/** Envelope energy after `t` seconds relative to the whole. */
function tailShare(x: Float32Array, t: number): number {
  let all = 0;
  let tail = 0;
  const from = Math.round(t * SR);
  for (let i = 0; i < x.length; i++) {
    const e = (x[i] as number) ** 2;
    all += e;
    if (i >= from) tail += e;
  }
  return tail / all;
}

describe('plucked strings', () => {
  it('tunes exactly: the rendered pitch is the one the tuning formula reports', () => {
    for (const [voice, f] of [
      [UD, 146.83],
      [UD, 233],
      [KANUN, 587.3],
    ] as const) {
      const { data, freq } = renderPluck(SR, f, voice, makeRandom(5));
      expect(freq).toBeCloseTo(pluckTuning(SR, f, voice.stretch).freq, 9);
      expect(Math.abs(1200 * Math.log2(freq / f))).toBeLessThan(25);
      // The spectral peak near the fundamental sits within a few cents of the reported pitch.
      let best = 0;
      let bestCents = 99;
      for (let c = -30; c <= 30; c += 2) {
        const s = strength(data, freq * Math.pow(2, c / 1200), Math.round(0.05 * SR), Math.round(0.9 * SR));
        if (s > best) {
          best = s;
          bestCents = c;
        }
      }
      expect(Math.abs(bestCents)).toBeLessThanOrEqual(4);
      expect(allFinite(data)).toBe(true);
      expect(peakOf(data)).toBeCloseTo(0.8, 5);
    }
  });
});

describe('struck and splashed sounds', () => {
  it('renders finite, normalised buffers', () => {
    const rnd = makeRandom(9);
    for (const buf of [stoneThud(SR, rnd, 'medium'), keystoneBoom(SR, rnd), chiselTap(SR, rnd), jointCrack(SR, rnd), malletWedge(SR, rnd), timberCreak(SR, rnd), splash(SR, rnd, 'large'), footstep(SR, rnd), hoof(SR, rnd)]) {
      expect(allFinite(buf)).toBe(true);
      expect(peakOf(buf)).toBeGreaterThan(0.79);
      expect(peakOf(buf)).toBeLessThanOrEqual(0.921);
    }
  });

  it('makes the keystone boom longer and lower than a thud', () => {
    const rnd = makeRandom(11);
    const thud = stoneThud(SR, rnd, 'medium');
    const boom = keystoneBoom(SR, rnd);
    expect(boom.length).toBeGreaterThan(thud.length * 4);
    // Audible length (within 30 dB of the loudest moment), dry.
    expect(analyze([boom], SR).duration).toBeGreaterThan(2);
    expect(analyze([thud], SR).duration).toBeLessThan(0.6);
    expect(tailShare(thud, 0.5)).toBeLessThan(0.01);
    // Most of the boom's energy is below 120 Hz.
    expect(strength(boom, 52, 0, SR)).toBeGreaterThan(strength(boom, 600, 0, SR) * 5);
  });

  it('sizes stones by pitch: small rings higher than large', () => {
    const small = stoneThud(SR, makeRandom(2), 'small');
    const large = stoneThud(SR, makeRandom(2), 'large');
    expect(strength(small, 230, 0, 8000)).toBeGreaterThan(strength(large, 230, 0, 8000) * 0.5);
    expect(strength(large, 95, 0, 8000)).toBeGreaterThan(strength(small, 95, 0, 8000));
  });
});

describe('loops', () => {
  it('joins a noise loop without a step', () => {
    const raw = pinkNoise(SR + 4800, makeRandom(4));
    const loop = seamlessLoop(raw, SR);
    expect(loop.length).toBe(SR);
    const jump = Math.abs((loop[0] as number) - (loop[SR - 1] as number));
    expect(jump).toBeLessThan(0.2);
  });

  it('renders the stereo rain and cricket loops', () => {
    const rnd = makeRandom(8);
    for (const [l, r] of [rainLoop(SR, rnd), cricketLoop(SR, rnd)]) {
      expect(l.length).toBe(r.length);
      expect(allFinite(l) && allFinite(r)).toBe(true);
      expect(Math.max(peakOf(l), peakOf(r))).toBeGreaterThan(0.5);
    }
  });
});

describe('the valley reverb', () => {
  it('has unit energy, a long decaying tail and two different ears', () => {
    const [l, r] = valleyImpulse(SR, makeRandom(1));
    let el = 0;
    let er = 0;
    let lr = 0;
    for (let i = 0; i < l.length; i++) {
      el += (l[i] as number) ** 2;
      er += (r[i] as number) ** 2;
      if (i > SR * 0.2) lr += (l[i] as number) * (r[i] as number);
    }
    expect(el).toBeCloseTo(1, 4);
    expect(er).toBeCloseTo(1, 4);
    expect(Math.abs(lr)).toBeLessThan(0.1);
    // Reverberation time from the energy decay between two late windows: a long, soft valley tail.
    const window = (a: number): number => {
      let e = 0;
      for (let i = Math.round(a * SR); i < Math.round((a + 0.5) * SR); i++) e += (l[i] as number) ** 2;
      return e;
    };
    const t60 = 60 / (10 * Math.log10(window(0.5) / window(1.5)));
    expect(t60).toBeGreaterThan(1.8);
    expect(t60).toBeLessThan(3.6);
    expect(tailShare(l, 3.4)).toBeLessThan(1e-4);
  });
});

describe('mix helpers', () => {
  it('soft-clips without ever passing full scale', () => {
    const c = softClipCurve();
    let prev = -Infinity;
    for (const v of c) {
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // Linear below the knee (the curve covers ±2, so index 3/4 is +1.0 and 5/8 is +0.5).
    expect(c[Math.round((c.length - 1) * 0.625)]).toBeCloseTo(0.5, 2);
  });

  it('maps fader positions to gains', () => {
    expect(faderGain(0)).toBe(0);
    expect(faderGain(1)).toBe(1);
    expect(faderGain(0.5)).toBeCloseTo(0.25, 6);
    expect(faderGain(Number.NaN)).toBe(0);
  });

  it('places sounds by the listener: pan by x, quieter and duller far away', () => {
    const near = place(0, { x: 0, distance: 20 });
    const right = place(30, { x: 0, distance: 20 });
    const far = place(0, { x: 0, distance: 400 });
    expect(near.pan).toBe(0);
    expect(right.pan).toBeGreaterThan(0.4);
    expect(place(-30, { x: 0, distance: 20 }).pan).toBeLessThan(-0.4);
    expect(far.gain).toBeLessThan(near.gain / 4);
    expect(far.lowpass).not.toBeNull();
    expect(near.lowpass).toBeNull();
    expect(far.send).toBeGreaterThan(near.send);
  });
});
