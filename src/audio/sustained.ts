/**
 * Sounds that last while something is going on: the low rumble of a collapse and the debris bed
 * that absorbs the impacts the rate limiter drops, the weight of a flood, an earthquake's rumble
 * and rattle, and heavy traffic passing. Each layer starts on demand and stops once silent.
 */
import type { ActorKind } from '../core/types';
import { clamp, clamp01 } from '../core/math';
import type { Bank, SoundName } from './bank';
import type { Random } from './dsp';
import type { ShotPlayer } from './player';

interface FilterSpec {
  readonly type: BiquadFilterType;
  readonly freq: number;
  readonly q?: number;
}

/** A looping bank buffer through fixed filters into a gain. */
class LoopLayer {
  private src: AudioBufferSourceNode | null = null;
  private readonly gain: GainNode;
  private readonly filters: BiquadFilterNode[];
  private target = 0;
  private quietAt = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly bank: Bank,
    private readonly name: SoundName,
    out: AudioNode,
    specs: readonly FilterSpec[],
    private readonly rnd: Random,
  ) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.filters = specs.map((s) => {
      const f = ctx.createBiquadFilter();
      f.type = s.type;
      f.frequency.value = s.freq;
      f.Q.value = s.q ?? 0.7;
      return f;
    });
    let node: AudioNode = this.gain;
    for (let i = this.filters.length - 1; i >= 0; i--) {
      const f = this.filters[i] as BiquadFilterNode;
      f.connect(node);
      node = f;
    }
    this.gain.connect(out);
  }

  private get head(): AudioNode {
    return this.filters[0] ?? this.gain;
  }

  get active(): boolean {
    return this.src !== null;
  }

  set(level: number, now: number, tau: number): void {
    const v = clamp(Number.isFinite(level) ? level : 0, 0, 2);
    if (v > 0 && !this.src) {
      const buffer = this.bank.get(this.name);
      if (!buffer) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(this.head);
      src.start(now, this.rnd() * buffer.duration);
      this.src = src;
      this.gain.gain.setValueAtTime(0, now);
    }
    if (!this.src) return;
    this.target = v;
    this.gain.gain.setTargetAtTime(v, now, Math.max(0.01, tau));
    if (v === 0) this.quietAt = now + tau * 7;
  }

  filter(i: number): BiquadFilterNode | null {
    return this.filters[i] ?? null;
  }

  /** Stop the source once it has faded out, so idle layers cost nothing. */
  tick(now: number): void {
    if (this.src && this.target === 0 && now > this.quietAt) {
      try {
        this.src.stop(now);
      } catch {
        // Already stopped.
      }
      this.src.disconnect();
      this.src = null;
    }
  }
}

const HEAVY_WHEELS: readonly ActorKind[] = ['cannon', 'ox-cart', 'carriage'];

export class Sustained {
  private readonly collapse: LoopLayer;
  private readonly debris: LoopLayer;
  private readonly floodLow: LoopLayer;
  private readonly floodBody: LoopLayer;
  private readonly quakeLow: LoopLayer;
  private readonly quakeRattle: LoopLayer;
  private readonly wheels: LoopLayer;
  private readonly engine: LoopLayer;
  private debrisEnergy = 0;
  private collapsing = false;
  private collapseLevel = 0;
  private flooding = 0;
  private floodPeak = false;
  private quaking = 0;
  private nextKnock = 0;
  private nextJitter = 0;
  private nextSwell = 0;

  constructor(
    ctx: BaseAudioContext,
    private readonly bank: Bank,
    out: AudioNode,
    private readonly rnd: Random,
    private readonly shots: ShotPlayer,
  ) {
    const L = (name: SoundName, specs: FilterSpec[]): LoopLayer => new LoopLayer(ctx, this.bank, name, out, specs, rnd);
    this.collapse = L('brown', [{ type: 'lowpass', freq: 90, q: 0.8 }]);
    this.debris = L('brown', [
      { type: 'lowpass', freq: 380, q: 0.5 },
      { type: 'highpass', freq: 45 },
    ]);
    this.floodLow = L('brown', [{ type: 'lowpass', freq: 240, q: 0.6 }]);
    this.floodBody = L('pink', [{ type: 'bandpass', freq: 520, q: 0.6 }]);
    this.quakeLow = L('brown', [{ type: 'lowpass', freq: 60, q: 1.4 }]);
    this.quakeRattle = L('rattle', [{ type: 'highpass', freq: 500 }]);
    this.wheels = L('brown', [{ type: 'bandpass', freq: 150, q: 0.9 }]);
    this.engine = L('brown', [
      { type: 'peaking', freq: 48, q: 4 },
      { type: 'lowpass', freq: 220, q: 0.7 },
    ]);
    const peak = this.engine.filter(0);
    if (peak) peak.gain.value = 14;
  }

  /** An impact the limiter dropped still adds to the mass of the fall. */
  absorb(energy: number): void {
    this.debrisEnergy = Math.min(40, this.debrisEnergy + Math.max(0, energy));
  }

  collapseStart(now: number): void {
    this.collapsing = true;
    this.collapseLevel = 0.55;
    this.collapse.set(this.collapseLevel, now, 0.5);
  }

  collapseEnd(now: number): void {
    this.collapsing = false;
    this.collapse.set(0, now, 0.8);
    this.debris.set(0, now, 0.6);
    this.debrisEnergy = 0;
  }

  flood(phase: 'rise' | 'peak' | 'fall' | 'end', drama: number, now: number): void {
    const d = clamp01(Number.isFinite(drama) ? drama : 0.5);
    if (phase === 'rise') this.flooding = 0.25 + 0.35 * d;
    else if (phase === 'peak') this.flooding = 0.45 + 0.45 * d;
    else if (phase === 'fall') this.flooding = 0.2 * (0.5 + d);
    else this.flooding = 0;
    this.floodPeak = phase === 'peak' && d > 0.35;
    const tau = phase === 'rise' ? 1.4 : phase === 'end' ? 1.2 : 0.9;
    this.floodLow.set(this.flooding * 0.45, now, tau);
    this.floodBody.set(this.flooding * 0.18, now, tau);
    if (phase === 'peak') {
      // The surge hitting the piers.
      this.shots.play(this.bank.get('splash-large'), { gain: 0.2 + 0.2 * d, rate: 0.8, send: 0.35 });
      this.shots.play(this.bank.get('ground'), { gain: 0.2 + 0.2 * d, rate: 0.7, send: 0.25 });
    }
  }

  quake(phase: 'start' | 'end', pga: number, now: number): void {
    const s = clamp01((Number.isFinite(pga) ? pga : 0.1) / 0.4);
    this.quaking = phase === 'start' ? 0.35 + 0.65 * s : 0;
    const tau = phase === 'start' ? 0.35 : 0.6;
    this.quakeLow.set(this.quaking * 1.1, now, tau);
    this.quakeRattle.set(this.quaking * 0.25 * s, now, tau);
  }

  pass(kind: ActorKind, phase: 'enter' | 'mid' | 'exit', now: number): void {
    const level = phase === 'mid' ? 1 : phase === 'enter' ? 0.55 : 0;
    const tau = phase === 'exit' ? 1.2 : 0.8;
    if (kind === 'truck') this.engine.set(level * 0.2, now, tau);
    else if (HEAVY_WHEELS.includes(kind)) this.wheels.set(level * (kind === 'cannon' ? 0.4 : 0.22), now, tau);
  }

  tick(now: number, dt: number): void {
    // Debris energy leaks away; while it is high, the bed under the impacts swells.
    this.debrisEnergy *= Math.exp(-dt / 0.7);
    if (this.collapsing || this.debrisEnergy > 0.05) {
      this.debris.set(Math.min(0.7, Math.sqrt(this.debrisEnergy) * 0.16), now, 0.25);
    }
    if (this.collapsing && now >= this.nextSwell) {
      this.nextSwell = now + 0.4 + this.rnd() * 0.8;
      this.collapse.set(this.collapseLevel * (0.75 + 0.5 * this.rnd()), now, 0.35);
    }
    if (this.quaking > 0 && now >= this.nextJitter) {
      // Ground shaking is irregular: fast random swells of the low layer.
      this.nextJitter = now + 0.07 + this.rnd() * 0.15;
      this.quakeLow.set(this.quaking * (0.6 + 0.8 * this.rnd()), now, 0.05);
    }
    if (this.floodPeak && now >= this.nextKnock) {
      // Driftwood knocking against the cutwaters.
      this.nextKnock = now + 0.9 + this.rnd() * 2.2;
      this.shots.play(this.bank.get('knock'), { gain: 0.12 + 0.12 * this.rnd(), rate: 0.6 + 0.2 * this.rnd(), pan: this.rnd() - 0.5, send: 0.4, lowpass: 1800 });
    }
    for (const l of [this.collapse, this.debris, this.floodLow, this.floodBody, this.quakeLow, this.quakeRattle, this.wheels, this.engine]) l.tick(now);
  }
}
