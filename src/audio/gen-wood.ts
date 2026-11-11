/**
 * Timber and other soft-material sounds: knocks (modal), creaks and groans (stick-slip pulse trains
 * through wooden resonances), the mallet on a wedge, the seal stamp and a page turning.
 */
import { addChirp, addModes, addNoiseBurst, Biquad, fadeOut, jitter, normalize, rr, type Mode, type Random } from './dsp';

function woodModes(rnd: Random, f1: number, decay: number): Mode[] {
  const ratios = [1, 2.42, 3.9, 5.3, 7.1];
  const amps = [1, 0.55, 0.35, 0.2, 0.1];
  const t60 = [0.13, 0.08, 0.05, 0.035, 0.025];
  return ratios.map((r, i) => ({
    freq: jitter(rnd, f1 * r, 0.05),
    amp: (amps[i] as number) * rr(rnd, 0.7, 1.2),
    t60: (t60[i] as number) * decay,
  }));
}

/** Timber beams knocking together (the centering going up, driftwood). */
export function woodKnock(sr: number, rnd: Random): Float32Array {
  const out = new Float32Array(Math.round(sr * 0.4));
  addNoiseBurst(out, sr, 0, rnd, { amp: 0.6, attack: 0.0005, t60: 0.008, lowpass: 4500 });
  addModes(out, sr, woodModes(rnd, rr(rnd, 230, 420), 1), 0, 0.6);
  addChirp(out, sr, 0, { f0: 120, f1: 85, glide: 0.03, t60: 0.1, amp: 0.4 });
  fadeOut(out, sr, 0.03);
  normalize([out], 0.9);
  return out;
}

/** A muffled knock: the rubber-band stop at a handle's limit. */
export function dullKnock(sr: number, rnd: Random): Float32Array {
  const out = new Float32Array(Math.round(sr * 0.25));
  addNoiseBurst(out, sr, 0, rnd, { amp: 0.3, attack: 0.001, t60: 0.01, lowpass: 1200 });
  addModes(
    out,
    sr,
    [
      { freq: 170, amp: 1, t60: 0.09 },
      { freq: 395, amp: 0.4, t60: 0.05 },
      { freq: 640, amp: 0.15, t60: 0.03 },
    ],
    0,
    0.8,
  );
  fadeOut(out, sr, 0.02);
  normalize([out], 0.85);
  return out;
}

/** Mallet on a hardwood wedge: a hard crack, the wedge ringing, and the wedge flying out. */
export function malletWedge(sr: number, rnd: Random): Float32Array {
  const out = new Float32Array(Math.round(sr * 0.5));
  addNoiseBurst(out, sr, 0, rnd, { amp: 0.8, attack: 0.0002, t60: 0.004, lowpass: 7000 });
  addModes(out, sr, woodModes(rnd, rr(rnd, 480, 560), 1.3), 0, 0.6);
  addChirp(out, sr, 0, { f0: 170, f1: 120, glide: 0.03, t60: 0.16, amp: 0.7, attack: 0.001 });
  addNoiseBurst(out, sr, Math.round(sr * 0.012), rnd, { amp: 0.25, attack: 0.001, t60: 0.03, highpass: 1500, lowpass: 6000 });
  fadeOut(out, sr, 0.03);
  normalize([out], 0.92);
  return out;
}

interface StickSlip {
  readonly seconds: number;
  /** Pulse rate at the start, middle and end, Hz. */
  readonly rates: readonly [number, number, number];
  /** Resonances of the body: frequency, Q, gain. */
  readonly body: readonly (readonly [number, number, number])[];
  readonly jitter: number;
}

/**
 * Friction as a train of slips: each slip is an impulse into the body's resonances, and the slip
 * rate wanders. This is how a loaded joint creaks and a beam groans.
 */
function stickSlip(sr: number, rnd: Random, o: StickSlip): Float32Array {
  const len = Math.round(sr * (o.seconds + 0.15));
  const pulses = new Float32Array(len);
  let t = 0.005;
  while (t < o.seconds) {
    const ph = t / o.seconds;
    const [a, b, c] = o.rates;
    const rate = ph < 0.5 ? a + (b - a) * (ph * 2) : b + (c - b) * (ph * 2 - 1);
    const env = Math.pow(Math.sin(Math.PI * ph), 0.5);
    const i = Math.round(t * sr);
    if (i < len) pulses[i] = env * rr(rnd, 0.55, 1);
    t += (1 / Math.max(2, rate)) * (1 + o.jitter * (rnd() - 0.5));
  }
  const res = o.body.map(([f, q]) => Biquad.bandpass(sr, jitter(rnd, f, 0.06), q));
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const x = pulses[i] as number;
    let y = 0;
    for (let k = 0; k < res.length; k++) y += (res[k] as Biquad).process(x) * ((o.body[k] as readonly number[])[2] as number);
    out[i] = y;
  }
  fadeOut(out, sr, 0.08);
  normalize([out], 0.85);
  return out;
}

/** Timber creaking under the weight of the stones (higher, quicker). */
export function timberCreak(sr: number, rnd: Random): Float32Array {
  return stickSlip(sr, rnd, {
    seconds: rr(rnd, 0.35, 0.9),
    rates: [rr(rnd, 18, 30), rr(rnd, 45, 80), rr(rnd, 20, 35)],
    body: [
      [310, 12, 1],
      [720, 10, 0.7],
      [1180, 9, 0.45],
      [1900, 8, 0.2],
    ],
    jitter: 0.3,
  });
}

/** The centering groaning as it takes or gives up the load (lower, slower). */
export function timberGroan(sr: number, rnd: Random): Float32Array {
  return stickSlip(sr, rnd, {
    seconds: rr(rnd, 1.0, 1.6),
    rates: [rr(rnd, 8, 14), rr(rnd, 22, 34), rr(rnd, 9, 15)],
    body: [
      [140, 9, 1],
      [330, 10, 0.75],
      [610, 9, 0.4],
    ],
    jitter: 0.35,
  });
}

/** A small wooden tick for interface taps. */
export function woodTick(sr: number, rnd: Random): Float32Array {
  const out = new Float32Array(Math.round(sr * 0.12));
  addNoiseBurst(out, sr, 0, rnd, { amp: 0.35, attack: 0.0004, t60: 0.004, lowpass: 5000 });
  addModes(
    out,
    sr,
    [
      { freq: 1040, amp: 1, t60: 0.055 },
      { freq: 2390, amp: 0.4, t60: 0.03 },
      { freq: 3720, amp: 0.15, t60: 0.02 },
    ],
    0,
    0.7,
  );
  fadeOut(out, sr, 0.01);
  normalize([out], 0.8);
  return out;
}

/** The ledger's seal pressed down: a wooden press, paper under it, a soft thump. */
export function sealStamp(sr: number, rnd: Random): Float32Array {
  const out = new Float32Array(Math.round(sr * 0.7));
  addNoiseBurst(out, sr, 0, rnd, { amp: 0.4, attack: 0.002, t60: 0.03, lowpass: 1400 });
  addModes(
    out,
    sr,
    [
      { freq: jitter(rnd, 118, 0.04), amp: 1, t60: 0.16 },
      { freq: jitter(rnd, 305, 0.04), amp: 0.5, t60: 0.09 },
      { freq: jitter(rnd, 590, 0.04), amp: 0.25, t60: 0.05 },
    ],
    0,
    0.8,
  );
  addChirp(out, sr, 0, { f0: 90, f1: 55, glide: 0.06, t60: 0.25, amp: 0.7, attack: 0.003 });
  addNoiseBurst(out, sr, Math.round(sr * 0.01), rnd, { amp: 0.06, attack: 0.01, t60: 0.12, highpass: 1500, lowpass: 6000 });
  fadeOut(out, sr, 0.05);
  normalize([out], 0.9);
  return out;
}

/** A ledger page turning: a soft swish that brightens, with two small crinkles. */
export function pageTurn(sr: number, rnd: Random): Float32Array {
  const len = Math.round(sr * 0.32);
  const out = new Float32Array(len);
  const bp = Biquad.bandpass(sr, 2400, 0.9);
  const bp2 = Biquad.bandpass(sr, 4800, 1.2);
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 1.6);
    const x = 2 * rnd() - 1;
    out[i] = (bp.process(x) * (1 - t) + bp2.process(x) * t) * env * 0.6;
  }
  addNoiseBurst(out, sr, Math.round(len * 0.35), rnd, { amp: 0.12, attack: 0.001, t60: 0.01, highpass: 2500 });
  addNoiseBurst(out, sr, Math.round(len * 0.62), rnd, { amp: 0.08, attack: 0.001, t60: 0.01, highpass: 2500 });
  fadeOut(out, sr, 0.03);
  normalize([out], 0.8);
  return out;
}
