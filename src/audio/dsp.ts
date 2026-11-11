/**
 * Pure sample-generation helpers for the start-up sound bank. Everything here writes into
 * Float32Arrays and never touches Web Audio, so it runs in unit tests, in the offline harness and
 * at start-up alike. Per-sample JavaScript is allowed only here, once, while the bank is built.
 */
import { mulberry32 } from '../core/rng';

export type Random = () => number;

/** ln(1000): an exponential falls by 60 dB after this many time constants. */
export const LN1000 = Math.log(1000);

export function makeRandom(seed: number): Random {
  return mulberry32(seed);
}

/** Uniform in [a, b). */
export function rr(rnd: Random, a: number, b: number): number {
  return a + (b - a) * rnd();
}

/** x scaled by a random factor in [1 - amount, 1 + amount]: no two renders are the same. */
export function jitter(rnd: Random, x: number, amount: number): number {
  return x * (1 + amount * (2 * rnd() - 1));
}

export function samples(sr: number, seconds: number): number {
  return Math.max(1, Math.round(sr * seconds));
}

/** One resonant mode of a struck body: frequency, peak amplitude and time to fall by 60 dB. */
export interface Mode {
  readonly freq: number;
  readonly amp: number;
  readonly t60: number;
}

/**
 * Adds exponentially decaying sinusoids (modal synthesis). Uses the two-multiply recursive
 * oscillator instead of Math.sin per sample, which keeps bank generation in the low milliseconds.
 */
export function addModes(out: Float32Array, sr: number, modes: readonly Mode[], start = 0, gain = 1): void {
  for (const m of modes) {
    if (!(m.freq > 0) || m.freq >= sr * 0.45 || !(m.t60 > 0)) continue;
    const w = (2 * Math.PI * m.freq) / sr;
    const r = Math.exp(-LN1000 / (m.t60 * sr));
    const c = 2 * r * Math.cos(w);
    const r2 = r * r;
    const len = Math.min(out.length - start, Math.ceil(m.t60 * sr));
    if (len < 2) continue;
    const a = m.amp * gain;
    // Sine phase: starts at zero, so the attack shape comes from the excitation, not a click.
    let y2 = 0;
    let y1 = a * r * Math.sin(w);
    out[start + 1] = (out[start + 1] ?? 0) + y1;
    for (let n = 2; n < len; n++) {
      const y = c * y1 - r2 * y2;
      out[start + n] += y;
      y2 = y1;
      y1 = y;
    }
  }
}

/**
 * Adds a decaying sine whose frequency glides exponentially from f0 to f1: thumps that drop in
 * pitch, bubbles that rise. `attack` is a short linear fade-in in seconds.
 */
export function addChirp(
  out: Float32Array,
  sr: number,
  start: number,
  o: { f0: number; f1: number; glide: number; t60: number; amp: number; attack?: number },
): void {
  const len = Math.min(out.length - start, Math.ceil(o.t60 * sr));
  const attack = Math.max(1, Math.round((o.attack ?? 0.002) * sr));
  const decay = Math.exp(-LN1000 / (o.t60 * sr));
  const glideN = Math.max(1, o.glide * sr);
  const ratio = o.f1 / o.f0;
  let phase = 0;
  let env = o.amp;
  for (let n = 0; n < len; n++) {
    const t = Math.min(1, n / glideN);
    const f = o.f0 * Math.pow(ratio, t);
    phase += (2 * Math.PI * f) / sr;
    const a = n < attack ? n / attack : 1;
    out[start + n] += Math.sin(phase) * env * a;
    env *= decay;
  }
}

/** Second-order IIR section (RBJ cookbook), used to colour noise and excite resonances. */
export class Biquad {
  private z1 = 0;
  private z2 = 0;
  private constructor(
    private readonly b0: number,
    private readonly b1: number,
    private readonly b2: number,
    private readonly a1: number,
    private readonly a2: number,
  ) {}

  static bandpass(sr: number, f: number, q: number): Biquad {
    const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    return new Biquad(alpha / a0, 0, -alpha / a0, (-2 * Math.cos(w)) / a0, (1 - alpha) / a0);
  }

  static lowpass(sr: number, f: number, q = Math.SQRT1_2): Biquad {
    const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
    const alpha = Math.sin(w) / (2 * q);
    const cw = Math.cos(w);
    const a0 = 1 + alpha;
    return new Biquad((1 - cw) / 2 / a0, (1 - cw) / a0, (1 - cw) / 2 / a0, (-2 * cw) / a0, (1 - alpha) / a0);
  }

  static highpass(sr: number, f: number, q = Math.SQRT1_2): Biquad {
    const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
    const alpha = Math.sin(w) / (2 * q);
    const cw = Math.cos(w);
    const a0 = 1 + alpha;
    return new Biquad((1 + cw) / 2 / a0, -(1 + cw) / a0, (1 + cw) / 2 / a0, (-2 * cw) / a0, (1 - alpha) / a0);
  }

  process(x: number): number {
    // Transposed direct form II: stable and cheap.
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }

  run(data: Float32Array, from = 0, to = data.length): void {
    for (let i = from; i < to; i++) data[i] = this.process(data[i] as number);
  }
}

/** Coefficient of a one-pole smoother for a cutoff in Hz. */
export function onePole(sr: number, cutoff: number): number {
  return 1 - Math.exp((-2 * Math.PI * Math.min(cutoff, sr * 0.45)) / sr);
}

export function lowpassInPlace(data: Float32Array, sr: number, cutoff: number): void {
  const k = onePole(sr, cutoff);
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    y += k * ((data[i] as number) - y);
    data[i] = y;
  }
}

export function highpassInPlace(data: Float32Array, sr: number, cutoff: number): void {
  const k = onePole(sr, cutoff);
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i] as number;
    y += k * (x - y);
    data[i] = x - y;
  }
}

/**
 * Adds a burst of noise shaped by a linear attack and an exponential decay, optionally band-limited
 * by one-pole filters. The building block of contacts, dust, splashes and breath.
 */
export function addNoiseBurst(
  out: Float32Array,
  sr: number,
  start: number,
  rnd: Random,
  o: { amp: number; attack: number; t60: number; lowpass?: number; highpass?: number },
): void {
  const len = Math.min(out.length - start, Math.ceil((o.attack + o.t60) * sr));
  if (len <= 0) return;
  const attack = Math.max(1, Math.round(o.attack * sr));
  const decay = Math.exp(-LN1000 / (o.t60 * sr));
  const lp = o.lowpass ? onePole(sr, o.lowpass) : 1;
  const hp = o.highpass ? onePole(sr, o.highpass) : 0;
  let l = 0;
  let h = 0;
  let env = o.amp;
  for (let n = 0; n < len; n++) {
    const x = 2 * rnd() - 1;
    l += lp * (x - l);
    h += hp * (l - h);
    const a = n < attack ? n / attack : 1;
    out[start + n] += (l - h) * env * a;
    if (n >= attack) env *= decay;
  }
}

export function whiteNoise(len: number, rnd: Random): Float32Array {
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = 2 * rnd() - 1;
  return out;
}

/** Pink noise (Paul Kellet's refined filter), roughly unit peak. */
export function pinkNoise(len: number, rnd: Random): Float32Array {
  const out = new Float32Array(len);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = 2 * rnd() - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return out;
}

/** Brown (red) noise: a leaky integral of white noise, roughly unit peak. */
export function brownNoise(len: number, rnd: Random): Float32Array {
  const out = new Float32Array(len);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (2 * rnd() - 1)) / 1.02;
    out[i] = last * 3.5;
  }
  return out;
}

/**
 * Turns `data` (at least loopLength + fade samples) into a seamless loop of loopLength samples by
 * cross-fading the overrun into the head with equal power (the two ends are uncorrelated noise).
 */
export function seamlessLoop(data: Float32Array, loopLength: number): Float32Array {
  const fade = Math.min(data.length - loopLength, loopLength >> 1);
  const out = data.slice(0, loopLength);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    out[i] = (data[i] as number) * Math.sqrt(t) + (data[loopLength + i] as number) * Math.sqrt(1 - t);
  }
  return out;
}

/** Adds `src` into `out` at `start`, wrapping around the end (builds loops out of events). */
export function addWrapped(out: Float32Array, src: Float32Array, start: number, gain = 1): void {
  const n = out.length;
  let j = ((start % n) + n) % n;
  for (let i = 0; i < src.length; i++) {
    out[j] += (src[i] as number) * gain;
    j++;
    if (j === n) j = 0;
  }
}

export function peakOf(data: Float32Array): number {
  let p = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i] as number);
    if (a > p) p = a;
  }
  return p;
}

/** Scales every channel together so the loudest sample reaches `target`. */
export function normalize(chans: readonly Float32Array[], target: number): void {
  let p = 0;
  for (const c of chans) p = Math.max(p, peakOf(c));
  if (!(p > 0)) return;
  const k = target / p;
  for (const c of chans) for (let i = 0; i < c.length; i++) c[i] = (c[i] as number) * k;
}

/** Short linear fade at the end so a buffer never stops on a click. */
export function fadeOut(data: Float32Array, sr: number, seconds: number): void {
  const n = Math.min(data.length, Math.round(sr * seconds));
  const s = data.length - n;
  for (let i = 0; i < n; i++) data[s + i] = (data[s + i] as number) * (1 - i / n);
}

/** True when every sample is a finite number (generators are tested with this). */
export function allFinite(data: Float32Array): boolean {
  for (let i = 0; i < data.length; i++) if (!Number.isFinite(data[i] as number)) return false;
  return true;
}
