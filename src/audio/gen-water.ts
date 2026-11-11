/**
 * Water: splashes (a broadband slap, the low thump of the air cavity, a wash that darkens as it
 * falls back, and droplets) and the seamless rain loop.
 */
import { addChirp, addNoiseBurst, addWrapped, fadeOut, highpassInPlace, normalize, onePole, rr, type Random } from './dsp';

export type SplashSize = 'small' | 'medium' | 'large';

interface SplashShape {
  readonly seconds: number;
  readonly slap: number;
  readonly cavity: readonly [number, number];
  readonly cavityAmp: number;
  readonly wash: number;
  readonly washFrom: number;
  readonly washTo: number;
  readonly drops: number;
}

const SHAPES: Readonly<Record<SplashSize, SplashShape>> = {
  small: { seconds: 0.6, slap: 0.35, cavity: [620, 1150], cavityAmp: 0.35, wash: 0.18, washFrom: 7000, washTo: 2500, drops: 4 },
  medium: { seconds: 1.4, slap: 0.6, cavity: [150, 85], cavityAmp: 0.6, wash: 0.65, washFrom: 7000, washTo: 1500, drops: 16 },
  large: { seconds: 2.6, slap: 0.8, cavity: [95, 48], cavityAmp: 1, wash: 1.5, washFrom: 6000, washTo: 800, drops: 40 },
};

/** Noise whose low-pass corner glides exponentially from `from` to `to` while it decays. */
function addWash(out: Float32Array, sr: number, rnd: Random, t60: number, from: number, to: number, amp: number): void {
  const len = Math.min(out.length, Math.round(sr * t60));
  const attack = Math.round(sr * 0.03);
  const decay = Math.exp(-6.9 / (t60 * sr));
  let env = amp;
  let y1 = 0;
  let y2 = 0;
  let k = onePole(sr, from);
  for (let i = 0; i < len; i++) {
    if ((i & 63) === 0) k = onePole(sr, from * Math.pow(to / from, i / len));
    const x = 2 * rnd() - 1;
    y1 += k * (x - y1);
    y2 += k * (y1 - y2);
    out[i] += y2 * env * (i < attack ? i / attack : 1);
    if (i >= attack) env *= decay;
  }
}

export function splash(sr: number, rnd: Random, size: SplashSize): Float32Array {
  const s = SHAPES[size];
  const out = new Float32Array(Math.round(sr * s.seconds));
  addNoiseBurst(out, sr, 0, rnd, { amp: s.slap, attack: 0.001, t60: 0.03, highpass: 300 });
  addChirp(out, sr, 0, { f0: s.cavity[0], f1: s.cavity[1], glide: 0.12, t60: Math.min(0.45, s.seconds * 0.3), amp: s.cavityAmp, attack: 0.004 });
  addWash(out, sr, rnd, s.wash, s.washFrom, s.washTo, 0.9);
  for (let i = 0; i < s.drops; i++) {
    const t = 0.08 + Math.pow(rnd(), 1.5) * (s.seconds * 0.7);
    const f = rr(rnd, 900, 3200);
    addChirp(out, sr, Math.round(sr * t), { f0: f, f1: f * 1.5, glide: 0.03, t60: rr(rnd, 0.03, 0.07), amp: rr(rnd, 0.03, 0.09) });
  }
  fadeOut(out, sr, Math.min(0.2, s.seconds * 0.1));
  normalize([out], 0.9);
  return out;
}

/** Four seconds of rain on water and stone, stereo, looping without a seam. */
export function rainLoop(sr: number, rnd: Random): [Float32Array, Float32Array] {
  const len = Math.round(sr * 4);
  const out: [Float32Array, Float32Array] = [new Float32Array(len), new Float32Array(len)];
  const grain = new Float32Array(Math.round(sr * 0.06));
  for (let i = 0; i < 900; i++) {
    grain.fill(0);
    addNoiseBurst(grain, sr, 0, rnd, { amp: 1, attack: 0.0003, t60: rr(rnd, 0.002, 0.006), highpass: 2500 });
    if (rnd() < 0.25) {
      const f = rr(rnd, 2200, 6000);
      addChirp(grain, sr, 0, { f0: f, f1: f * 1.3, glide: 0.015, t60: 0.03, amp: 0.4 });
    }
    const pan = rnd();
    const g = Math.pow(rnd(), 2) * 0.9 + 0.1;
    const at = Math.round(rnd() * len);
    addWrapped(out[0], grain, at, g * Math.sqrt(1 - pan));
    addWrapped(out[1], grain, at, g * Math.sqrt(pan));
  }
  for (const c of out) highpassInPlace(c, sr, 400);
  normalize(out, 0.8);
  return out;
}
