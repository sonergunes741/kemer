/**
 * The three voices of the music: the plucked string (rendered Karplus-Strong, retuned by rate),
 * the breathy reed (a soft, nearly pure tone with a scoop into pitch, late vibrato and breath
 * noise, like a ney) and the drone (detuned saws through a low-pass, slowly breathing).
 */
import type { Bank, PluckInstrument } from './bank';
import { rr, type Random } from './dsp';
import { scheduleSwell } from './envelope';

/** Played note counts, for the harness. */
export const played = { pluck: 0, ney: 0 };

export function playPluck(
  ctx: BaseAudioContext,
  bank: Bank,
  out: AudioNode,
  inst: PluckInstrument,
  freq: number,
  when: number,
  vel: number,
  rnd: Random,
): void {
  const p = bank.pluck(inst, freq);
  if (!p || !(freq > 0)) return;
  const src = ctx.createBufferSource();
  src.buffer = p.buffer;
  if (inst === 'ud' && rnd() < 0.25) {
    // The ud is fretless: now and then a note slides in from a few cents below.
    src.playbackRate.setValueAtTime(p.rate * Math.pow(2, -28 / 1200), when);
    src.playbackRate.setTargetAtTime(p.rate, when + 0.01, 0.03);
  } else {
    src.playbackRate.value = p.rate;
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(vel, when + 0.003);
  src.connect(g);
  g.connect(out);
  src.onended = () => {
    src.disconnect();
    g.disconnect();
  };
  src.start(when);
  src.stop(when + p.buffer.duration / p.rate + 0.05);
  played.pluck++;
}

const waves = new WeakMap<BaseAudioContext, PeriodicWave>();

/** A ney's spectrum: a strong fundamental, a little octave, very weak upper partials. */
function neyWave(ctx: BaseAudioContext): PeriodicWave {
  let w = waves.get(ctx);
  if (!w) {
    const real = new Float32Array([0, 0, 0, 0, 0, 0, 0]);
    const imag = new Float32Array([0, 1, 0.2, 0.09, 0.035, 0.018, 0.008]);
    w = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    waves.set(ctx, w);
  }
  return w;
}

export function playNey(
  ctx: BaseAudioContext,
  bank: Bank,
  out: AudioNode,
  freq: number,
  when: number,
  dur: number,
  vel: number,
  rnd: Random,
): void {
  const noise = bank.get('white', 0);
  if (!noise || !(freq > 0)) return;
  const end = when + dur + 1.4;
  const o = ctx.createOscillator();
  o.setPeriodicWave(neyWave(ctx));
  // Scoop into the note from below, as a reed player does.
  o.frequency.setValueAtTime(freq * Math.pow(2, -32 / 1200), when);
  o.frequency.setTargetAtTime(freq, when, 0.06);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rr(rnd, 4.6, 5.6);
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, when);
  // Vibrato only blooms late in a held note.
  depth.gain.setTargetAtTime(freq * 0.0055, when + Math.min(0.7, dur * 0.45), 0.3);
  lfo.connect(depth);
  depth.connect(o.frequency);
  const tone = ctx.createGain();
  scheduleSwell(tone.gain, when, dur, { attack: 0.3, release: 0.45 }, vel * 0.55);
  o.connect(tone);
  tone.connect(out);

  const n = ctx.createBufferSource();
  n.buffer = noise;
  n.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = freq * 1.02;
  band.Q.value = 3;
  const air = ctx.createBiquadFilter();
  air.type = 'highpass';
  air.frequency.value = 2400;
  const breath = ctx.createGain();
  // A chiff of breath at the start, then a quiet steady breath under the tone.
  breath.gain.setValueAtTime(0, when);
  breath.gain.linearRampToValueAtTime(vel * 0.16, when + 0.07);
  breath.gain.setTargetAtTime(vel * 0.05, when + 0.07, 0.18);
  breath.gain.setTargetAtTime(0, when + dur, 0.15);
  const airGain = ctx.createGain();
  airGain.gain.value = 0.18;
  n.connect(band);
  band.connect(breath);
  n.connect(air);
  air.connect(airGain);
  airGain.connect(breath);
  breath.connect(out);

  o.onended = () => {
    for (const node of [o, lfo, depth, tone, n, band, air, airGain, breath]) node.disconnect();
  };
  o.start(when);
  lfo.start(when);
  n.start(when, rnd() * Math.max(0, noise.duration - 1));
  o.stop(end);
  lfo.stop(end);
  n.stop(end);
  played.ney++;
}

/** A held drone on a few pitches, fading in and out and breathing slowly. */
export class Drone {
  private readonly oscs: OscillatorNode[] = [];
  private readonly lfo: OscillatorNode;
  private readonly gain: GainNode;
  private readonly nodes: AudioNode[] = [];

  constructor(ctx: BaseAudioContext, out: AudioNode, freqs: readonly number[], level: number, when: number, fade: number) {
    const lowest = Math.min(...freqs);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowest * 4;
    filter.Q.value = 0.4;
    // Breathing modulates its own stage, so fading the outer gain to zero silences everything.
    const breath = ctx.createGain();
    this.gain = ctx.createGain();
    this.gain.gain.setValueAtTime(0, when);
    this.gain.gain.setTargetAtTime(level, when, Math.max(0.3, fade / 2));
    filter.connect(breath);
    breath.connect(this.gain);
    this.gain.connect(out);
    freqs.forEach((f, i) => {
      for (const cents of [-3, 3]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = cents;
        const g = ctx.createGain();
        // Upper drone pitches sit well under the root.
        g.gain.value = (i === 0 ? 0.5 : 0.28) / freqs.length;
        o.connect(g);
        g.connect(filter);
        o.start(when);
        this.oscs.push(o);
        this.nodes.push(o, g);
      }
    });
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 0.25;
    this.lfo.connect(depth);
    depth.connect(breath.gain);
    this.lfo.start(when);
    this.nodes.push(filter, breath, this.gain, this.lfo, depth);
  }

  stop(when: number, fade: number): void {
    this.gain.gain.cancelScheduledValues(when);
    this.gain.gain.setTargetAtTime(0, when, Math.max(0.05, fade / 3));
    const end = when + Math.max(0.2, fade * 2.5);
    for (const o of this.oscs) o.stop(end);
    this.lfo.stop(end);
    const last = this.oscs[0];
    if (last) last.onended = () => this.nodes.forEach((n) => n.disconnect());
  }
}
