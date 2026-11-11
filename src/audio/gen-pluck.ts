/**
 * Plucked strings by Karplus-Strong, rendered once at start-up and retuned at playback by rate.
 * The loop is a delay of N samples and a two-tap average weighted by S, so its length is exactly
 * N + S samples and the rendered pitch is known to the hundredth of a cent (microtones matter).
 */
import { fadeOut, lowpassInPlace, normalize, type Random } from './dsp';

export interface PluckVoice {
  /** Weight of the older tap in the loop average, 0..0.5: 0.5 is darkest (ud), small is bright (kanun). */
  readonly stretch: number;
  /** Seconds to fall by 60 dB at a given pitch. */
  readonly t60: (freq: number) => number;
  /** Pluck position as a fraction of the string (comb notch in the excitation). */
  readonly position: number;
  /** Brightness of the plectrum, Hz (low-pass on the excitation noise). */
  readonly excitationHz: number;
  readonly maxSeconds: number;
}

/** Ud: warm, woody, a medium sustain, plucked near the bridge with a quill. */
export const UD: PluckVoice = {
  stretch: 0.5,
  t60: (f) => Math.min(3, Math.max(0.9, 2.5 * Math.pow(146.8 / f, 0.45))),
  position: 0.12,
  excitationHz: 2600,
  maxSeconds: 3,
};

/** Kanun: brighter, longer ringing strings plucked with ring plectra. */
export const KANUN: PluckVoice = {
  stretch: 0.18,
  t60: (f) => Math.min(3.4, Math.max(1, 3 * Math.pow(293.7 / f, 0.5))),
  position: 0.2,
  excitationHz: 5200,
  maxSeconds: 3.4,
};

/** Delay length and exact pitch for a requested frequency. */
export function pluckTuning(sr: number, freq: number, stretch: number): { n: number; freq: number } {
  const n = Math.max(2, Math.floor(sr / freq - stretch));
  return { n, freq: sr / (n + stretch) };
}

export function renderPluck(sr: number, freq: number, v: PluckVoice, rnd: Random): { data: Float32Array; freq: number } {
  const { n, freq: actual } = pluckTuning(sr, freq, v.stretch);
  const t60 = v.t60(actual);
  const len = Math.round(sr * Math.min(v.maxSeconds, t60 * 1.05));
  const out = new Float32Array(len);

  // Excitation: one period of coloured noise, notched at the pluck position, without DC.
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 2 * rnd() - 1;
  lowpassInPlace(x, sr, v.excitationHz);
  const p = Math.max(1, Math.round(v.position * n));
  for (let i = n - 1; i >= p; i--) x[i] -= x[i - p] as number;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i] as number;
  mean /= n;
  for (let i = 0; i < n; i++) x[i] -= mean;

  const rho = Math.pow(0.001, 1 / (actual * t60));
  const a = (1 - v.stretch) * rho;
  const b = v.stretch * rho;
  for (let i = 0; i < len; i++) {
    const fb = i > n ? a * (out[i - n] as number) + b * (out[i - n - 1] as number) : i === n ? a * (out[0] as number) : 0;
    out[i] = (i < n ? (x[i] as number) : 0) + fb;
  }
  fadeOut(out, sr, 0.05);
  normalize([out], 0.8);
  return { data: out, freq: actual };
}

/** Base pitches rendered for each instrument: every five semitones over its range. */
export function pluckBases(low: number, high: number, semitones = 5): number[] {
  const out: number[] = [];
  for (let f = low; f <= high * 1.001; f *= Math.pow(2, semitones / 12)) out.push(f);
  return out;
}
