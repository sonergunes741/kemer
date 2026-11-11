/**
 * The mix bus.
 *
 *   music dry ─ musicDuck ─ musicVol ─────────┐
 *   music wet ─ musicDuckWet ─ musicVolWet ─┐ │
 *   ambience ─ ambienceDuck ─┬─────────── fx ┤ │
 *                           └─ send ─ fxWet ┤ │
 *   effects dry ────────────────────── fxVol ┼─┼─ master ─ mute ─ trim ─ limiter ─ soft clip ─ out
 *   effects wet ───────────────── fxWetVol ─ reverb ─ return ┘          (meter taps the end)
 *
 * Reverb sends are taken after the volume faders, so the sliders scale dry and wet alike, and
 * there is one convolver for everything.
 */
import { clamp01 } from '../core/math';

export interface Volumes {
  master: number;
  music: number;
  effects: number;
}

const TAU = 0.05;

/** Perceptual fader: a slider position becomes a gain (0.5 is about -12 dB). */
export function faderGain(v: number): number {
  const x = clamp01(Number.isFinite(v) ? v : 0);
  return x * x;
}

/**
 * Soft-clip curve over a ±2 input range (the input is halved before the shaper): linear up to
 * 0.7, then a tanh knee that never exceeds 1. Pure; the limiter's last line of defence.
 */
export function softClipCurve(points = 2048, knee = 0.7): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const s = ((i / (points - 1)) * 2 - 1) * 2;
    const a = Math.abs(s);
    const y = a < knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee));
    curve[i] = Math.sign(s) * y;
  }
  return curve;
}

export class Mixer {
  readonly music: GainNode;
  readonly musicWet: GainNode;
  readonly fx: GainNode;
  readonly fxWet: GainNode;
  readonly ambience: GainNode;
  readonly meter: AnalyserNode;
  readonly output: AudioNode;
  private readonly musicDuck: GainNode;
  private readonly musicDuckWet: GainNode;
  private readonly musicVol: GainNode;
  private readonly musicVolWet: GainNode;
  private readonly fxVol: GainNode;
  private readonly fxWetVol: GainNode;
  readonly ambienceDuck: GainNode;
  private readonly master: GainNode;
  private readonly mute: GainNode;
  private readonly reverb: ConvolverNode;
  private readonly reverbReturn: GainNode;

  constructor(
    private readonly ctx: BaseAudioContext,
    destination: AudioNode,
  ) {
    const g = (value: number): GainNode => {
      const node = ctx.createGain();
      node.gain.value = value;
      return node;
    };
    this.music = g(1);
    this.musicWet = g(1);
    this.musicDuck = g(1);
    this.musicDuckWet = g(1);
    this.musicVol = g(1);
    this.musicVolWet = g(1);
    this.fx = g(1);
    this.fxWet = g(1);
    this.fxVol = g(1);
    this.fxWetVol = g(1);
    this.ambience = g(1);
    this.ambienceDuck = g(1);
    this.master = g(1);
    this.mute = g(1);
    this.reverbReturn = g(0.55);

    this.reverb = ctx.createConvolver();
    // We normalise the impulse ourselves, so the return gain means what it says.
    this.reverb.normalize = false;

    // Bus compression with a little headroom. Chromium adds make-up gain, hence the trim before it.
    const trim = g(0.8);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 10;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.22;
    const pre = g(0.5);
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = '2x';
    const post = g(1);

    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 2048;
    this.meter.smoothingTimeConstant = 0.6;

    this.music.connect(this.musicDuck).connect(this.musicVol).connect(this.master);
    this.musicWet.connect(this.musicDuckWet).connect(this.musicVolWet).connect(this.reverb);
    this.ambience.connect(this.ambienceDuck);
    this.ambienceDuck.connect(this.fx);
    const ambienceSend = g(0.12);
    this.ambienceDuck.connect(ambienceSend).connect(this.fxWet);
    this.fx.connect(this.fxVol).connect(this.master);
    this.fxWet.connect(this.fxWetVol).connect(this.reverb);
    this.reverb.connect(this.reverbReturn).connect(this.master);
    this.master.connect(this.mute).connect(trim).connect(limiter).connect(pre).connect(clip).connect(post);
    post.connect(destination);
    post.connect(this.meter);
    this.output = post;
  }

  setImpulse(buffer: AudioBuffer | null): void {
    if (!buffer) return;
    try {
      this.reverb.buffer = buffer;
    } catch {
      // A sample-rate mismatch leaves the mix dry rather than broken.
    }
  }

  setVolumes(v: Volumes, now: number): void {
    const m = faderGain(v.master);
    const mu = faderGain(v.music);
    const fx = faderGain(v.effects);
    this.master.gain.setTargetAtTime(m, now, TAU);
    this.musicVol.gain.setTargetAtTime(mu, now, TAU);
    this.musicVolWet.gain.setTargetAtTime(mu, now, TAU);
    this.fxVol.gain.setTargetAtTime(fx, now, TAU);
    this.fxWetVol.gain.setTargetAtTime(fx, now, TAU);
  }

  setMuted(muted: boolean, now: number): void {
    this.mute.gain.setTargetAtTime(muted ? 0 : 1, now, TAU);
  }

  /** Hold the music silent (the fall) or let it back in. */
  duckMusic(level: number, now: number, seconds: number): void {
    const tau = Math.max(0.01, seconds / 3);
    this.musicDuck.gain.setTargetAtTime(level, now, tau);
    this.musicDuckWet.gain.setTargetAtTime(level, now, tau);
  }

  get context(): BaseAudioContext {
    return this.ctx;
  }
}
