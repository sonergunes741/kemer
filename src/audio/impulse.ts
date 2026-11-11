/**
 * The impulse response of the one shared reverb: an open river valley. A few short, slightly dull
 * early reflections off stone (bank, piers, the bridge itself), then a long soft tail that builds
 * slowly (the far slopes) and loses its highs first. Pure; normalised to unit energy per channel
 * so the return gain alone sets how wet the mix is.
 */
import { LN1000, onePole, rr, type Random } from './dsp';

export interface ValleyOptions {
  readonly seconds?: number;
  /** Decay to -60 dB of the low and the high part of the tail. */
  readonly t60Low?: number;
  readonly t60High?: number;
}

export function valleyImpulse(sr: number, rnd: Random, o: ValleyOptions = {}): [Float32Array, Float32Array] {
  const seconds = o.seconds ?? 3.6;
  const t60Low = o.t60Low ?? 3.2;
  const t60High = o.t60High ?? 1.3;
  const len = Math.round(sr * seconds);
  const out: [Float32Array, Float32Array] = [new Float32Array(len), new Float32Array(len)];

  // Early reflections: discrete taps, each a little later and quieter, different in each ear.
  const taps = [0.011, 0.019, 0.027, 0.036, 0.048, 0.061, 0.077, 0.095, 0.118];
  for (let k = 0; k < taps.length; k++) {
    const amp = 0.6 * Math.pow(0.8, k) * rr(rnd, 0.75, 1.15);
    for (let ch = 0; ch < 2; ch++) {
      const offset = (taps[k] as number) + rr(rnd, -0.0015, 0.0015) + (ch === k % 2 ? 0.0009 : 0);
      const i = Math.round(offset * sr);
      const side = ch === k % 2 ? 1 : 0.62;
      if (i < len) out[ch][i] += amp * side * (rnd() < 0.5 ? -1 : 1);
    }
  }
  // Stone reflects dull: smooth the taps (two passes of a one-pole at ~5 kHz).
  for (const ch of out) {
    for (let pass = 0; pass < 2; pass++) {
      const k = onePole(sr, 5200);
      let y = 0;
      for (let i = 0; i < len; i++) {
        y += k * ((ch[i] as number) - y);
        ch[i] = y;
      }
    }
  }

  // Tail: decorrelated noise in each ear, split into a low band (long) and a high band (short).
  const start = Math.round(0.03 * sr);
  const build = Math.round(0.16 * sr);
  const dLow = Math.exp(-LN1000 / (t60Low * sr));
  const dHigh = Math.exp(-LN1000 / (t60High * sr));
  const split = onePole(sr, 1400);
  for (let ch = 0; ch < 2; ch++) {
    const data = out[ch];
    let lp = 0;
    let eLow = 0.2;
    let eHigh = 0.2;
    for (let i = start; i < len; i++) {
      const x = 2 * rnd() - 1;
      lp += split * (x - lp);
      const hp = x - lp;
      const n = i - start;
      // The diffuse field arrives gradually (a valley, not a hall): raised-cosine build-up.
      const onset = n < build ? 0.5 - 0.5 * Math.cos((Math.PI * n) / build) : 1;
      data[i] += onset * (lp * eLow * 1.6 + hp * eHigh * 0.7);
      eLow *= dLow;
      eHigh *= dHigh;
    }
  }

  // Fade the last 8 % so the tail never ends on a step.
  const fade = Math.round(len * 0.08);
  for (const ch of out) for (let i = 0; i < fade; i++) ch[len - fade + i] *= 1 - i / fade;

  for (const ch of out) {
    let e = 0;
    for (let i = 0; i < len; i++) e += (ch[i] as number) * (ch[i] as number);
    const k = e > 0 ? 1 / Math.sqrt(e) : 1;
    for (let i = 0; i < len; i++) ch[i] *= k;
  }
  return out;
}
