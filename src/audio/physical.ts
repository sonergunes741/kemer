/**
 * Physical sounds from bus events: stones, the keystone, chisel and mallet, timber, water, debris,
 * cracks, the settling arch, floods, earthquakes, traffic and seals. Positioned by the listener,
 * rate-limited per kind and voice-limited, so a collapse of hundreds of stones stays a roar and
 * never a clip. Events the limiter drops still feed the low debris bed.
 */
import type { Bus, BusEvents } from '../core/bus';
import type { ActorKind, Vec3 } from '../core/types';
import { clamp, finiteOr } from '../core/math';
import { log } from '../core/log';
import type { Bank, SoundName } from './bank';
import { jitter, rr, type Random } from './dsp';
import { STONE_CLASS, type StoneSize } from './gen-stone';
import { place, type Listener, type ShotPlayer } from './player';
import type { Sustained } from './sustained';
import { RateLimiter } from './voices';

/** Sustained rates per kind: a flurry of laid stones, a collapse's impacts and splashes. */
export const RATE_RULES = {
  stone: { rate: 24, burst: 8 },
  impact: { rate: 22, burst: 8 },
  splash: { rate: 14, burst: 6 },
  crack: { rate: 8, burst: 3 },
  creak: { rate: 3, burst: 2 },
  fall: { rate: 1.5, burst: 2 },
  step: { rate: 14, burst: 4 },
};

interface StepRecipe {
  readonly sound: SoundName;
  readonly alt?: SoundName;
  readonly gain: number;
  readonly rate: readonly [number, number];
  /** Several feet at once (an army). */
  readonly feet?: number;
}

const STEPS: Readonly<Record<ActorKind, StepRecipe>> = {
  villager: { sound: 'step', gain: 0.3, rate: [0.9, 1.1] },
  cyclist: { sound: 'tyre', gain: 0.12, rate: [1.35, 1.6] },
  donkey: { sound: 'hoof', gain: 0.26, rate: [1.15, 1.35] },
  rider: { sound: 'hoof', gain: 0.42, rate: [0.95, 1.1] },
  'ox-cart': { sound: 'wheel', alt: 'pad', gain: 0.22, rate: [0.8, 0.95] },
  caravan: { sound: 'pad', gain: 0.24, rate: [0.85, 1.05] },
  army: { sound: 'step', gain: 0.26, rate: [0.85, 1.05], feet: 3 },
  cannon: { sound: 'wheel', gain: 0.4, rate: [0.6, 0.75] },
  carriage: { sound: 'hoof', alt: 'wheel', gain: 0.36, rate: [0.95, 1.1] },
  truck: { sound: 'tyre', gain: 0.32, rate: [0.7, 0.85] },
};

export interface PhysicalHooks {
  /** Real silence, then the river returns (after the centering falls, after a collapse). */
  silence(after: number, hold: number, rise: number): void;
  /** Hold the music out during the fall, and let it back afterwards. */
  collapse(on: boolean): void;
}

export class Physical {
  readonly limiter = new RateLimiter(RATE_RULES);
  listener: Listener = { x: 0, distance: 30 };
  private lastStrikeSilence = -Infinity;

  constructor(
    private readonly bank: Bank,
    private readonly shots: ShotPlayer,
    private readonly sustained: Sustained,
    private readonly clock: () => number,
    private readonly rnd: Random,
    private readonly hooks: PhysicalHooks,
  ) {}

  attach(bus: Bus): () => void {
    const offs: (() => void)[] = [];
    const on = <K extends keyof BusEvents>(type: K, fn: (p: BusEvents[K]) => void): void => {
      offs.push(
        bus.on(type, (p) => {
          try {
            fn(p);
          } catch (err) {
            log.once(`audio:${type}`, 'audio', `sound for ${type} failed`, err);
          }
        }),
      );
    };
    on('stone:land', (p) => this.stone(p.at, p.mass, p.part, p.count));
    on('keystone:seat', (p) => this.keystone(p.at));
    on('mark:tap', (p) => this.at(p.at, 'chisel', 0.34 + (p.n >= 3 ? 0.06 : 0), jitter(this.rnd, 1, 0.03), 0.15));
    on('centering:raise', (p) => this.centeringRaise(p.at));
    on('wedge:strike', (p) => this.wedge(p.at, p.left));
    on('centering:fall', (p) => this.centeringFall(p.at));
    on('timber:creak', (p) => this.creak(p.at, p.strain));
    on('arch:settle', (p) => this.at(p.at, 'settle', clamp(0.12 + finiteOr(p.drop, 0.01) * 10, 0.12, 0.35), rr(this.rnd, 0.88, 1.02), 0.35));
    on('splash', (p) => this.splash(p.at, p.size));
    on('impact', (p) => this.impact(p.at, p.energy, p.surface));
    on('crack', (p) => {
      if (this.limiter.allow('crack', this.clock())) this.at(p.at, 'crack', 0.7, jitter(this.rnd, 1, 0.08), 0.25);
    });
    on('collapse:start', () => {
      this.sustained.collapseStart(this.clock());
      this.hooks.collapse(true);
      this.shots.play(this.bank.get('groan'), { gain: 0.5, rate: 0.6, send: 0.4, priority: 2 });
    });
    on('collapse:end', () => {
      this.sustained.collapseEnd(this.clock());
      this.hooks.silence(0.4, 1.6, 4);
      this.hooks.collapse(false);
    });
    on('flood', (p) => this.sustained.flood(p.phase, p.drama, this.clock()));
    on('quake', (p) => {
      const now = this.clock();
      this.sustained.quake(p.phase, p.pga, now);
      if (p.phase === 'start') this.shots.play(this.bank.get('ground'), { gain: clamp(0.3 + p.pga, 0.3, 0.8), rate: 0.55, send: 0.3 });
    });
    on('traffic:pass', (p) => this.sustained.pass(p.kind, p.phase, this.clock()));
    on('traffic:step', (p) => this.step(p.kind, p.at));
    on('seal:stamp', (p) => {
      const master = p.which === 'masterwork';
      this.shots.play(this.bank.get('stamp'), { gain: master ? 0.85 : 0.82, rate: master ? 0.85 : jitter(this.rnd, 1, 0.03), send: 0.2, priority: 2 });
      if (master) this.shots.play(this.bank.get('litho'), { gain: 0.2, when: this.clock() + 0.05, send: 0.5, priority: 2 });
    });
    return () => offs.forEach((off) => off());
  }

  /** Plays a bank sound at a world position. */
  private at(at: Vec3, sound: SoundName, gain: number, rate: number, send: number, when?: number, priority?: number, darken?: number): boolean {
    const pl = place(at.x, this.listener);
    return this.shots.play(this.bank.get(sound), {
      when,
      gain: gain * pl.gain,
      rate,
      pan: pl.pan,
      send: Math.max(send, pl.send),
      lowpass: darken ? Math.min(darken, pl.lowpass ?? darken) : pl.lowpass,
      priority: priority ?? gain,
    });
  }

  private stone(at: Vec3, mass: number, part: string, count: number): void {
    const m = clamp(finiteOr(mass, 1), 0.02, 60);
    const size: StoneSize = m < 0.55 ? 'small' : m < 1.8 ? 'medium' : 'large';
    const cls = STONE_CLASS[size];
    // Loudness follows the absolute mass; the size class only sets the pitch.
    const weight = clamp(Math.pow(m, 0.3), 0.45, 1.5);
    const n = clamp(Math.round(finiteOr(count, 1)), 1, 40);
    const now = this.clock();
    const onTimber = part === 'voussoir' || part === 'keystone';
    let t = now;
    for (let i = 0; i < Math.min(n, 5); i++) {
      if (!this.limiter.allow('stone', now)) {
        this.sustained.absorb(m);
        continue;
      }
      const g = 0.5 * weight * Math.pow(0.8, i);
      const rate = clamp(Math.cbrt(cls.mass / m), 0.8, 1.25) * jitter(this.rnd, 1, 0.045);
      this.at(at, `thud-${size}`, g, rate, 0.18, t);
      // Laid on the centering, the timber gives a little; on stone, the courses clack.
      if (onTimber) this.at(at, 'knock', 0.16 * weight * Math.pow(0.8, i), rr(this.rnd, 0.62, 0.8), 0.12, t + 0.004, 0.05, 1500);
      else this.at(at, 'clack', 0.08 * weight, rr(this.rnd, 0.8, 1.0), 0.12, t + 0.002, 0.05, 2500);
      t += rr(this.rnd, 0.045, 0.13);
    }
    if (n > 5) this.sustained.absorb((n - 5) * m * 0.5);
  }

  private keystone(at: Vec3): void {
    const pl = place(at.x, this.listener);
    // The moment of the build: it carries even from a distance.
    this.shots.play(this.bank.get('boom'), { gain: 0.75 * Math.max(0.65, Math.min(1, pl.gain)), pan: pl.pan * 0.6, send: 0.5, priority: 3 });
  }

  private centeringRaise(at: Vec3): void {
    const now = this.clock();
    let t = now;
    for (let i = 0; i < 5; i++) {
      this.at(at, 'knock', rr(this.rnd, 0.24, 0.42), rr(this.rnd, 0.75, 1.15), 0.2, t, 0.3);
      t += rr(this.rnd, 0.22, 0.6);
    }
    this.at(at, 'creak', 0.18, rr(this.rnd, 0.9, 1.05), 0.2, now + 1.1, 0.3);
    this.at(at, 'groan', 0.16, rr(this.rnd, 0.95, 1.1), 0.25, t + 0.1, 0.3);
  }

  /** Each blow is heavier and lower than the last; the timber groans after it. */
  private wedge(at: Vec3, left: number): void {
    const k = 2 - clamp(Math.round(finiteOr(left, 2)), 0, 2);
    const now = this.clock();
    this.at(at, 'mallet', 0.95 + 0.15 * k, (1 - 0.12 * k) * jitter(this.rnd, 1, 0.02), 0.25, now, 3);
    this.at(at, 'groan', 0.18 + 0.12 * k, 0.98 - 0.08 * k, 0.3, now + 0.14, 1);
  }

  private centeringFall(at: Vec3): void {
    const now = this.clock();
    if (!this.limiter.allow('fall', now)) return;
    this.at(at, 'groan', 0.5, 0.78, 0.35, now, 2);
    let t = now + 0.1;
    for (let i = 0; i < 5; i++) {
      this.at(at, 'knock', rr(this.rnd, 0.25, 0.45), rr(this.rnd, 0.55, 0.8), 0.3, t, 1.5);
      t += rr(this.rnd, 0.06, 0.16);
    }
    // Timber slaps the water.
    this.at({ ...at, y: 0 }, 'splash-large', 0.42, rr(this.rnd, 0.95, 1.1), 0.35, now + 0.85, 2);
    this.at({ ...at, y: 0 }, 'splash-medium', 0.3, rr(this.rnd, 0.9, 1.1), 0.35, now + 1.05, 1.5);
    this.at({ ...at, y: 0 }, 'splash-medium', 0.22, rr(this.rnd, 0.9, 1.1), 0.35, now + 1.3, 1.5);
    // Then real silence, then the river. Several spans falling share one silence.
    if (now - this.lastStrikeSilence > 4) {
      this.lastStrikeSilence = now;
      this.hooks.silence(1.9, 1.5, 3.5);
    }
  }

  private creak(at: Vec3, strain: number): void {
    const s = clamp(finiteOr(strain, 0), 0, 1);
    if (s < 0.05 || !this.limiter.allow('creak', this.clock())) return;
    this.at(at, 'creak', 0.06 + 0.26 * s, (1.15 - 0.3 * s) * jitter(this.rnd, 1, 0.05), 0.2, undefined, 0.2);
  }

  private splash(at: Vec3, size: number): void {
    const s = clamp(finiteOr(size, 1), 0.05, 20);
    if (!this.limiter.allow('splash', this.clock())) {
      this.sustained.absorb(s);
      return;
    }
    const cls: SoundName = s < 0.6 ? 'splash-small' : s < 2.2 ? 'splash-medium' : 'splash-large';
    const ref = s < 0.6 ? 0.3 : s < 2.2 ? 1.2 : 4;
    const gain = clamp(0.17 + 0.11 * Math.log2(1 + s), 0.09, 0.55);
    const rate = clamp(Math.pow(ref / s, 0.15), 0.8, 1.25) * jitter(this.rnd, 1, 0.06);
    this.at(at, cls, gain, rate, 0.3);
  }

  private impact(at: Vec3, energy: number, surface: 'ground' | 'stone'): void {
    const e = clamp(finiteOr(energy, 1), 0, 1e5);
    const loud = Math.log10(1 + e);
    if (!this.limiter.allow('impact', this.clock())) {
      this.sustained.absorb(loud);
      return;
    }
    const gain = clamp(0.12 + 0.13 * loud, 0.08, 0.8);
    const rate = clamp(1.2 - 0.12 * loud, 0.7, 1.2) * jitter(this.rnd, 1, 0.05);
    if (surface === 'ground') this.at(at, 'ground', gain * 1.3, rate, 0.25);
    else {
      this.at(at, 'clack', gain * 1.8, rate, 0.25);
      if (e > 20) this.at(at, 'thud-large', gain * 0.6, rate * 0.9, 0.25, undefined, gain * 0.5);
    }
  }

  private step(kind: ActorKind, at: Vec3): void {
    const r = STEPS[kind];
    if (!r || !this.limiter.allow('step', this.clock())) return;
    const feet = r.feet ?? 1;
    const now = this.clock();
    for (let i = 0; i < feet; i++) {
      const sound = r.alt && this.rnd() < 0.4 ? r.alt : r.sound;
      this.at(at, sound, r.gain * (i === 0 ? 1 : 0.6), rr(this.rnd, r.rate[0], r.rate[1]), 0.15, now + i * rr(this.rnd, 0.03, 0.09), 0.1);
    }
  }
}
