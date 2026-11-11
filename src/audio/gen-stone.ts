/**
 * Stone sounds by modal synthesis: a short noisy contact exciting a handful of inharmonic modes,
 * plus a low body thump for weight. Rendered once into the bank; playback adds pitch and level.
 */
import {
  addChirp,
  addModes,
  addNoiseBurst,
  addWrapped,
  Biquad,
  fadeOut,
  jitter,
  normalize,
  rr,
  type Mode,
  type Random,
} from './dsp';

/** Inharmonic mode ratios of a roughly cubic block (measured stone blocks sit near these). */
const BLOCK = [1, 1.63, 2.27, 2.93, 3.8, 5.1, 6.6];
const BLOCK_AMP = [1, 0.6, 0.45, 0.3, 0.2, 0.12, 0.08];
const BLOCK_T60 = [0.3, 0.2, 0.15, 0.1, 0.07, 0.05, 0.035];

function blockModes(rnd: Random, f1: number, decay: number, bright: number): Mode[] {
  return BLOCK.map((r, i) => ({
    freq: jitter(rnd, f1 * r, 0.04),
    amp: (BLOCK_AMP[i] as number) * rr(rnd, 0.7, 1.2) * (i > 2 ? bright : 1),
    t60: (BLOCK_T60[i] as number) * decay * rr(rnd, 0.85, 1.15),
  }));
}

export type StoneSize = 'small' | 'medium' | 'large';

/** Fundamental and decay of each size class; mass in tonnes each class is rendered for. */
export const STONE_CLASS: Readonly<Record<StoneSize, { f1: number; decay: number; mass: number }>> = {
  small: { f1: 230, decay: 0.75, mass: 0.3 },
  medium: { f1: 150, decay: 1, mass: 1 },
  large: { f1: 95, decay: 1.35, mass: 3 },
};

/** A dressed stone set down on timber or stone: contact, ring, weight and a breath of grit. */
export function stoneThud(sr: number, rnd: Random, size: StoneSize): Float32Array {
  const c = STONE_CLASS[size];
  const out = new Float32Array(Math.round(sr * 0.75));
  const f1 = jitter(rnd, c.f1, 0.06);
  addNoiseBurst(out, sr, 0, rnd, { amp: 0.35, attack: 0.0008, t60: 0.012, lowpass: 1000 });
  addModes(out, sr, blockModes(rnd, f1, c.decay, 0.6), 0, 0.55);
  addChirp(out, sr, 0, { f0: f1 * 0.62, f1: f1 * 0.42, glide: 0.05, t60: 0.22 * c.decay, amp: 0.9, attack: 0.003 });
  addNoiseBurst(out, sr, Math.round(sr * 0.004), rnd, { amp: 0.03, attack: 0.004, t60: 0.07, lowpass: 4000, highpass: 1500 });
  fadeOut(out, sr, 0.04);
  normalize([out], 0.9);
  return out;
}

/** The keystone: a deep boom with slowly beating low modes, a hard seat and a long tail. */
export function keystoneBoom(sr: number, rnd: Random): Float32Array {
  const out = new Float32Array(Math.round(sr * 5.5));
  const f1 = jitter(rnd, 52, 0.03);
  const modes: Mode[] = [
    // The whole arch rings as one body, so the fundamental outlives everything else.
    // A weak, slow beat (2.4 s) keeps the tail alive without dipping it out of hearing.
    { freq: f1, amp: 1.6, t60: 7 },
    { freq: f1 * 1.008, amp: 0.3, t60: 6 },
    { freq: f1 * 1.58, amp: 0.55, t60: 3.8 },
    { freq: f1 * 2.21, amp: 0.42, t60: 2.4 },
    { freq: f1 * 2.23, amp: 0.2, t60: 2.2 },
    { freq: f1 * 2.93, amp: 0.3, t60: 1.5 },
    { freq: f1 * 3.62, amp: 0.25, t60: 0.9 },
    { freq: f1 * 4.7, amp: 0.15, t60: 0.6 },
    { freq: f1 * 6.1, amp: 0.1, t60: 0.4 },
    { freq: f1 * 8.3, amp: 0.06, t60: 0.25 },
  ];
  // A soft contact: the weight is in the ringing body, not in the click.
  addNoiseBurst(out, sr, 0, rnd, { amp: 0.3, attack: 0.001, t60: 0.02, lowpass: 2000 });
  addModes(out, sr, modes, 0, 0.5);
  addChirp(out, sr, 0, { f0: 78, f1: 38, glide: 0.18, t60: 0.7, amp: 0.75, attack: 0.004 });
  // The seat: stone meeting stone, short and hard.
  addModes(out, sr, blockModes(rnd, 720, 0.5, 1), 0, 0.09);
  // A few grains settling after the blow.
  for (let i = 0; i < 9; i++) {
    const at = Math.round(sr * rr(rnd, 0.05, 0.45));
    addNoiseBurst(out, sr, at, rnd, { amp: rr(rnd, 0.01, 0.04), attack: 0.0005, t60: 0.01, highpass: 1500, lowpass: 6000 });
  }
  fadeOut(out, sr, 0.5);
  normalize([out], 0.92);
  return out;
}

/** Stone hitting stone: brighter and shorter than a thud (debris, pier courses). */
export function stoneClack(sr: number, rnd: Random): Float32Array {
  const out = new Float32Array(Math.round(sr * 0.45));
  const f1 = rr(rnd, 480, 760);
  addNoiseBurst(out, sr, 0, rnd, { amp: 0.6, attack: 0.0004, t60: 0.008, lowpass: 7000 });
  addModes(out, sr, blockModes(rnd, f1, 0.55, 1.1), 0, 0.5);
  addChirp(out, sr, 0, { f0: 130, f1: 90, glide: 0.03, t60: 0.12, amp: 0.35, attack: 0.002 });
  fadeOut(out, sr, 0.03);
  normalize([out], 0.9);
  return out;
}

/** One chisel tap: hammer on steel, the steel rings briefly, a chip of stone flies. */
export function chiselTap(sr: number, rnd: Random): Float32Array {
  const out = new Float32Array(Math.round(sr * 0.55));
  const k = rr(rnd, 0.96, 1.04);
  addNoiseBurst(out, sr, 0, rnd, { amp: 0.7, attack: 0.0003, t60: 0.006, highpass: 1500 });
  addModes(
    out,
    sr,
    [
      { freq: 2650 * k, amp: 0.45, t60: 0.32 },
      { freq: 3870 * k, amp: 0.3, t60: 0.22 },
      { freq: 5980 * k, amp: 0.2, t60: 0.14 },
      { freq: 8100 * k, amp: 0.12, t60: 0.09 },
    ],
    0,
    0.35,
  );
  addChirp(out, sr, 0, { f0: 260, f1: 200, glide: 0.02, t60: 0.06, amp: 0.4 });
  addNoiseBurst(out, sr, Math.round(sr * 0.003), rnd, { amp: 0.25, attack: 0.001, t60: 0.03, highpass: 2500 });
  fadeOut(out, sr, 0.04);
  normalize([out], 0.85);
  return out;
}

/** A joint opening: a dry snap, then grit crumbling out of the joint. */
export function jointCrack(sr: number, rnd: Random): Float32Array {
  const out = new Float32Array(Math.round(sr * 0.6));
  addNoiseBurst(out, sr, 0, rnd, { amp: 0.9, attack: 0.0002, t60: 0.005 });
  addModes(out, sr, blockModes(rnd, rr(rnd, 700, 1000), 0.45, 1), 0, 0.35);
  addChirp(out, sr, 0, { f0: 170, f1: 95, glide: 0.05, t60: 0.18, amp: 0.7 });
  const grains = 30 + Math.floor(rnd() * 16);
  for (let i = 0; i < grains; i++) {
    const t = Math.pow(rnd(), 1.6) * 0.42;
    addNoiseBurst(out, sr, Math.round(sr * (0.01 + t)), rnd, {
      amp: rr(rnd, 0.03, 0.14) * (1 - t * 1.6),
      attack: 0.0004,
      t60: rr(rnd, 0.004, 0.015),
      highpass: 1500,
      lowpass: 6500,
    });
  }
  fadeOut(out, sr, 0.04);
  normalize([out], 0.9);
  return out;
}

/** Debris on earth: a dull thump and dirt crumbling after it. */
export function groundImpact(sr: number, rnd: Random): Float32Array {
  const out = new Float32Array(Math.round(sr * 0.9));
  addChirp(out, sr, 0, { f0: rr(rnd, 75, 95), f1: 42, glide: 0.08, t60: 0.3, amp: 1, attack: 0.003 });
  addNoiseBurst(out, sr, 0, rnd, { amp: 0.5, attack: 0.002, t60: 0.06, lowpass: 650 });
  for (let i = 0; i < 26; i++) {
    const t = Math.pow(rnd(), 1.4) * 0.55;
    addNoiseBurst(out, sr, Math.round(sr * (0.02 + t)), rnd, {
      amp: rr(rnd, 0.02, 0.07) * (1 - t),
      attack: 0.001,
      t60: rr(rnd, 0.01, 0.03),
      lowpass: 2200,
      highpass: 300,
    });
  }
  fadeOut(out, sr, 0.05);
  normalize([out], 0.9);
  return out;
}

/** The ring settling as the centering lets go: a slow grinding groan and joints closing. */
export function archSettle(sr: number, rnd: Random): Float32Array {
  const len = Math.round(sr * 1.8);
  const out = new Float32Array(len);
  const res = [Biquad.bandpass(sr, 95, 6), Biquad.bandpass(sr, 210, 7), Biquad.bandpass(sr, 390, 8)];
  const gains = [1, 0.7, 0.4];
  const pulses = new Float32Array(len);
  let t = 0.05;
  while (t < 1.5) {
    const ph = t / 1.5;
    const rate = 9 + 16 * Math.sin(Math.PI * ph);
    const i = Math.round(t * sr);
    if (i < len) pulses[i] = Math.pow(Math.sin(Math.PI * ph), 0.6) * rr(rnd, 0.5, 1);
    t += (1 / rate) * rr(rnd, 0.8, 1.25);
  }
  for (let i = 0; i < len; i++) {
    const x = pulses[i] as number;
    let y = 0;
    for (let k = 0; k < res.length; k++) y += (res[k] as Biquad).process(x) * (gains[k] as number);
    out[i] = y * 6;
  }
  addChirp(out, sr, 0, { f0: 70, f1: 45, glide: 0.1, t60: 0.5, amp: 0.4, attack: 0.02 });
  for (let i = 0; i < 7; i++) {
    addNoiseBurst(out, sr, Math.round(sr * rr(rnd, 0.2, 1.5)), rnd, { amp: rr(rnd, 0.04, 0.1), attack: 0.0005, t60: 0.01, highpass: 1200, lowpass: 5000 });
  }
  fadeOut(out, sr, 0.2);
  normalize([out], 0.85);
  return out;
}

/** A seamless stereo loop of small stones rattling (earthquakes). */
export function rattleLoop(sr: number, rnd: Random): [Float32Array, Float32Array] {
  const len = Math.round(sr * 2.5);
  const out: [Float32Array, Float32Array] = [new Float32Array(len), new Float32Array(len)];
  const grain = new Float32Array(Math.round(sr * 0.06));
  for (let i = 0; i < 120; i++) {
    grain.fill(0);
    addNoiseBurst(grain, sr, 0, rnd, { amp: 0.6, attack: 0.0004, t60: 0.004, highpass: 900 });
    addModes(grain, sr, blockModes(rnd, rr(rnd, 900, 2200), 0.12, 1), 0, 0.4);
    const at = Math.round(rnd() * len);
    const pan = rnd();
    const g = rr(rnd, 0.2, 1);
    addWrapped(out[0], grain, at, g * Math.sqrt(1 - pan));
    addWrapped(out[1], grain, at, g * Math.sqrt(pan));
  }
  normalize(out, 0.8);
  return out;
}

/** A struck stone slab (lithophone): one soft, low, long tone for the turn of a century. */
export function lithophone(sr: number, rnd: Random): Float32Array {
  const out = new Float32Array(Math.round(sr * 3));
  const f1 = jitter(rnd, 146.8, 0.002);
  addNoiseBurst(out, sr, 0, rnd, { amp: 0.15, attack: 0.002, t60: 0.01, lowpass: 1500 });
  addModes(
    out,
    sr,
    [
      { freq: f1, amp: 1, t60: 2.6 },
      { freq: f1 * 2.756, amp: 0.35, t60: 1.3 },
      { freq: f1 * 5.404, amp: 0.12, t60: 0.6 },
      { freq: f1 * 8.933, amp: 0.05, t60: 0.3 },
    ],
    0,
    1,
  );
  fadeOut(out, sr, 0.2);
  normalize([out], 0.8);
  return out;
}

/** A pebble click for handles. */
export function stoneTick(sr: number, rnd: Random): Float32Array {
  const out = new Float32Array(Math.round(sr * 0.12));
  addNoiseBurst(out, sr, 0, rnd, { amp: 0.4, attack: 0.0003, t60: 0.004, lowpass: 6000 });
  addModes(
    out,
    sr,
    [
      { freq: 1850, amp: 1, t60: 0.04 },
      { freq: 3150, amp: 0.45, t60: 0.028 },
      { freq: 4800, amp: 0.2, t60: 0.016 },
    ],
    0,
    0.6,
  );
  fadeOut(out, sr, 0.01);
  normalize([out], 0.8);
  return out;
}
