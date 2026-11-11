/**
 * Interface sounds: soft, short, woody or stony, never toy-like. Handle ticks follow the caller's
 * pitch ratio (it rises a little with the value); 'safe' is one warm note in the current makam.
 */
import type { SfxId } from '../core/contracts';
import { clamp } from '../core/math';
import type { Bank, SoundName } from './bank';
import { rr, type Random } from './dsp';
import { scheduleHit } from './envelope';
import type { Mixer } from './mixer';
import { ShotPlayer } from './player';
import { degreeFreq, type Makam } from './tuning';
import { RateLimiter } from './voices';

export interface SfxOptions {
  gain?: number;
  /** Frequency ratio, 1 = natural (2 = an octave up). */
  pitch?: number;
  /** -1 (left) .. 1 (right). */
  pan?: number;
}

interface Recipe {
  readonly sound: SoundName;
  readonly gain: number;
  readonly rate: number;
  readonly send: number;
  readonly lowpass?: number;
  /** Random pitch spread (fraction), so repeated taps are never identical. */
  readonly spread?: number;
}

/** Sample-based sounds; the tonal ones ('safe', 'unsafe', 'rumble') are built below. */
const RECIPES: Partial<Record<SfxId, Recipe>> = {
  'ui-tap': { sound: 'tick-wood', gain: 0.4, rate: 1, send: 0.08, spread: 0.03 },
  'ui-hover': { sound: 'tick-wood', gain: 0.1, rate: 1.55, send: 0.04, lowpass: 5000, spread: 0.04 },
  'ui-back': { sound: 'tick-wood', gain: 0.36, rate: 0.74, send: 0.08, spread: 0.03 },
  'ui-page': { sound: 'page', gain: 0.1, rate: 1, send: 0.1, spread: 0.06 },
  'handle-grab': { sound: 'tick-stone', gain: 0.36, rate: 0.82, send: 0.06, spread: 0.02 },
  'handle-tick': { sound: 'tick-stone', gain: 0.2, rate: 1.15, send: 0.04 },
  'handle-release': { sound: 'tick-stone', gain: 0.28, rate: 0.66, send: 0.08, spread: 0.02 },
  'handle-limit': { sound: 'knock-dull', gain: 0.4, rate: 1, send: 0.05, lowpass: 1600, spread: 0.03 },
  seal: { sound: 'stamp', gain: 0.8, rate: 1, send: 0.2, spread: 0.03 },
  'year-tick': { sound: 'tick-wood', gain: 0.11, rate: 2.1, send: 0.05, lowpass: 6000, spread: 0.05 },
  century: { sound: 'litho', gain: 0.13, rate: 1, send: 0.5 },
  timber: { sound: 'knock', gain: 0.4, rate: 0.9, send: 0.15, spread: 0.1 },
  crack: { sound: 'crack', gain: 0.47, rate: 1, send: 0.2, spread: 0.06 },
};

export class UiSounds {
  private readonly shots: ShotPlayer;
  private readonly limiter = new RateLimiter({
    'handle-tick': { rate: 30, burst: 4 },
    'year-tick': { rate: 9, burst: 2 },
    'ui-hover': { rate: 10, burst: 3 },
  });

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly bank: Bank,
    private readonly mixer: Mixer,
    private readonly clock: () => number,
    private readonly rnd: Random,
    private readonly makam: () => Makam,
  ) {
    this.shots = new ShotPlayer(ctx, mixer.fx, mixer.fxWet, clock, null);
  }

  play(id: SfxId, o: SfxOptions = {}): void {
    const now = this.clock();
    if (!this.limiter.allow(id, now)) return;
    const gain = clamp(Number.isFinite(o.gain) ? (o.gain as number) : 1, 0, 4);
    const pitch = clamp(Number.isFinite(o.pitch) && (o.pitch as number) > 0 ? (o.pitch as number) : 1, 0.25, 4);
    const pan = clamp(Number.isFinite(o.pan) ? (o.pan as number) : 0, -1, 1);
    if (id === 'safe') return this.note(7, 0.5 * gain, pitch, pan, false);
    if (id === 'unsafe') return this.note(-1, 0.42 * gain, pitch, pan, true);
    if (id === 'rumble') return this.rumble(0.55 * gain, pan);
    const r = RECIPES[id];
    if (!r) return;
    const spread = r.spread ?? 0;
    this.shots.play(this.bank.get(r.sound), {
      gain: r.gain * gain,
      rate: r.rate * pitch * (1 + spread * (2 * this.rnd() - 1)),
      pan,
      send: r.send,
      lowpass: r.lowpass ?? null,
    });
  }

  /** One ud note in the current makam; `muted` damps it with the palm (the unsafe answer). */
  private note(degree: number, gain: number, pitch: number, pan: number, muted: boolean): void {
    const freq = degreeFreq(this.makam(), degree) * pitch;
    const p = this.bank.pluck('ud', freq);
    if (!p) return;
    const ctx = this.ctx;
    const t = this.clock();
    const src = ctx.createBufferSource();
    src.buffer = p.buffer;
    src.playbackRate.value = p.rate;
    const g = ctx.createGain();
    if (muted) scheduleHit(g.gain, t, { attack: 0.003, hold: 0.06, decay: 0.35 }, gain);
    else g.gain.value = gain;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = muted ? 900 : 3600;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    src.connect(lp).connect(g).connect(panner);
    panner.connect(this.mixer.fx);
    const send = ctx.createGain();
    send.gain.value = muted ? 0.15 : 0.45;
    panner.connect(send).connect(this.mixer.fxWet);
    const nodes: AudioNode[] = [src, lp, g, panner, send];
    if (!muted) {
      // Warmth: a soft sine an octave under the string, swelling and fading with it.
      const o = ctx.createOscillator();
      o.frequency.value = freq / 2;
      const og = ctx.createGain();
      scheduleHit(og.gain, t, { attack: 0.06, decay: 1.6 }, gain * 0.12);
      o.connect(og).connect(panner);
      o.start(t);
      o.stop(t + 1.8);
      nodes.push(o, og);
    }
    const end = t + Math.min(p.buffer.duration / p.rate, muted ? 0.6 : 3);
    src.onended = () => nodes.forEach((n) => n.disconnect());
    src.start(t);
    src.stop(end);
  }

  /** A low rumble swelling and dying away (a distant fall, a tremor felt through the ground). */
  private rumble(gain: number, pan: number): void {
    const buffer = this.bank.get('brown');
    if (!buffer) return;
    const ctx = this.ctx;
    const t = this.clock();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = rr(this.rnd, 95, 130);
    const g = ctx.createGain();
    scheduleHit(g.gain, t, { attack: 0.35, hold: 0.3, decay: 1.8 }, gain);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan * 0.5;
    src.connect(lp).connect(g).connect(panner).connect(this.mixer.fx);
    src.onended = () => [src, lp, g, panner].forEach((n) => n.disconnect());
    src.start(t, this.rnd() * (buffer.duration - 3));
    src.stop(t + 2.6);
  }
}
