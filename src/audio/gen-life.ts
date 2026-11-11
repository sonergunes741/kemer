/**
 * Living things on and around the bridge: the summer-night cricket loop, and the steps, hooves,
 * pads and wheels of traffic on the stone deck.
 */
import { addChirp, addModes, addNoiseBurst, fadeOut, jitter, normalize, rr, type Random } from './dsp';

/**
 * Six seconds of three field crickets, each with its own carrier, chirp rhythm and place in the
 * stereo field. Chirps are written with wrap-around, so the loop has no seam.
 */
export function cricketLoop(sr: number, rnd: Random): [Float32Array, Float32Array] {
  const len = Math.round(sr * 6);
  const out: [Float32Array, Float32Array] = [new Float32Array(len), new Float32Array(len)];
  const crickets = [
    { f: rr(rnd, 4300, 4500), period: rr(rnd, 0.42, 0.5), pan: 0.25, amp: 0.8 },
    { f: rr(rnd, 4700, 4900), period: rr(rnd, 0.55, 0.65), pan: 0.75, amp: 0.55 },
    { f: rr(rnd, 5100, 5300), period: rr(rnd, 0.7, 0.85), pan: 0.5, amp: 0.35 },
  ];
  const pulseLen = Math.round(sr * 0.016);
  for (const c of crickets) {
    const chirps = Math.floor(6 / c.period);
    // Fit a whole number of chirps into the loop so the rhythm continues across the seam.
    const period = 6 / chirps;
    const gl = Math.sqrt(1 - c.pan) * c.amp;
    const gr = Math.sqrt(c.pan) * c.amp;
    for (let k = 0; k < chirps; k++) {
      const pulses = rnd() < 0.8 ? 3 : 4;
      const start = k * period + rr(rnd, 0, 0.02);
      for (let p = 0; p < pulses; p++) {
        const s0 = Math.round((start + p * 0.033) * sr);
        const a = (p === 0 ? 0.8 : 1) * rr(rnd, 0.85, 1);
        for (let i = 0; i < pulseLen; i++) {
          const env = Math.sin((Math.PI * i) / pulseLen);
          const v = Math.sin((2 * Math.PI * c.f * i) / sr) * env * env * a;
          const j = (s0 + i) % len;
          out[0][j] += v * gl;
          out[1][j] += v * gr;
        }
      }
    }
  }
  normalize(out, 0.7);
  return out;
}

/** A foot on stone paving: heel and toe, soft. */
export function footstep(sr: number, rnd: Random): Float32Array {
  const out = new Float32Array(Math.round(sr * 0.22));
  addNoiseBurst(out, sr, 0, rnd, { amp: 0.7, attack: 0.002, t60: 0.04, lowpass: 1100 });
  addChirp(out, sr, 0, { f0: 110, f1: 80, glide: 0.02, t60: 0.05, amp: 0.5 });
  const toe = Math.round(sr * rr(rnd, 0.055, 0.085));
  addNoiseBurst(out, sr, toe, rnd, { amp: 0.4, attack: 0.002, t60: 0.05, lowpass: 2200, highpass: 300 });
  fadeOut(out, sr, 0.02);
  normalize([out], 0.85);
  return out;
}

/** A shod hoof on stone: a bright clop with a short ring. */
export function hoof(sr: number, rnd: Random): Float32Array {
  const out = new Float32Array(Math.round(sr * 0.2));
  addNoiseBurst(out, sr, 0, rnd, { amp: 0.6, attack: 0.0004, t60: 0.006, lowpass: 7000 });
  const f = rr(rnd, 680, 820);
  addModes(
    out,
    sr,
    [
      { freq: f, amp: 1, t60: 0.05 },
      { freq: jitter(rnd, f * 1.85, 0.04), amp: 0.6, t60: 0.035 },
      { freq: jitter(rnd, f * 3.05, 0.04), amp: 0.3, t60: 0.02 },
    ],
    0,
    0.6,
  );
  addChirp(out, sr, 0, { f0: 140, f1: 100, glide: 0.02, t60: 0.05, amp: 0.4 });
  fadeOut(out, sr, 0.015);
  normalize([out], 0.85);
  return out;
}

/** A padded foot (camel, ox): a soft low thump with a little grit. */
export function pad(sr: number, rnd: Random): Float32Array {
  const out = new Float32Array(Math.round(sr * 0.25));
  addChirp(out, sr, 0, { f0: rr(rnd, 85, 100), f1: 60, glide: 0.04, t60: 0.14, amp: 1, attack: 0.008 });
  addNoiseBurst(out, sr, 0, rnd, { amp: 0.25, attack: 0.006, t60: 0.06, lowpass: 600 });
  addNoiseBurst(out, sr, Math.round(sr * 0.02), rnd, { amp: 0.05, attack: 0.003, t60: 0.06, highpass: 1500, lowpass: 5000 });
  fadeOut(out, sr, 0.02);
  normalize([out], 0.85);
  return out;
}

/** An iron-tyred wooden wheel dropping off a cobble: knock, rim click and rattle. */
export function wheel(sr: number, rnd: Random): Float32Array {
  const out = new Float32Array(Math.round(sr * 0.3));
  addNoiseBurst(out, sr, 0, rnd, { amp: 0.5, attack: 0.0005, t60: 0.01, lowpass: 5000 });
  const f = rr(rnd, 180, 240);
  addModes(
    out,
    sr,
    [
      { freq: f, amp: 1, t60: 0.1 },
      { freq: f * 2.6, amp: 0.45, t60: 0.06 },
      { freq: jitter(rnd, 2300, 0.1), amp: 0.12, t60: 0.05 },
    ],
    0,
    0.6,
  );
  for (let i = 0; i < 6; i++) {
    addNoiseBurst(out, sr, Math.round(sr * rr(rnd, 0.01, 0.15)), rnd, { amp: rr(rnd, 0.04, 0.12), attack: 0.0005, t60: 0.008, highpass: 800, lowpass: 4000 });
  }
  fadeOut(out, sr, 0.02);
  normalize([out], 0.85);
  return out;
}

/** A rubber tyre over a joint in the paving (lorries, bicycles): a low thud and grit. */
export function tyre(sr: number, rnd: Random): Float32Array {
  const out = new Float32Array(Math.round(sr * 0.3));
  addChirp(out, sr, 0, { f0: rr(rnd, 70, 85), f1: 55, glide: 0.05, t60: 0.16, amp: 1, attack: 0.006 });
  addNoiseBurst(out, sr, 0, rnd, { amp: 0.25, attack: 0.008, t60: 0.15, lowpass: 1600, highpass: 200 });
  fadeOut(out, sr, 0.02);
  normalize([out], 0.85);
  return out;
}
