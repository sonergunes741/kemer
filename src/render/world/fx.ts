/**
 * The world's effects: the FxApi other modules may call, and the bus events the world answers
 * by itself (dust where stones land, a ring when the keystone seats, splashes and ripples,
 * driftwood and rain in a flood, shake in an earthquake).
 */
import { Color } from 'three';
import type { DustKind, FxApi } from '../../core/contracts';
import type { Bus } from '../../core/bus';
import type { Vec3 } from '../../core/types';
import { clamp } from '../../core/math';
import type { Birds, Driftwood } from './ambient';
import type { Particles } from './particles';
import type { River } from './water';

/** The parts of the world the effects act on; any may be absent before a level is loaded. */
export interface FxTargets {
  particles(): Particles | null;
  river(): River | null;
  driftwood(): Driftwood | null;
  birds(): Birds | null;
  shake(amount: number): void;
  sustainShake(amount: number): void;
}

const WOOD = new Color(0x6b5236);
const LEAF = new Color(0x6c7f3a);
const EARTH = new Color(0x8a7458);

export class Fx implements FxApi {
  /** Weather asked for by the game (the world adds its own climate on top). */
  readonly forced = { rain: 0, snow: 0 };
  birdPresence = 1;
  ambientLife = true;
  quake = 0;
  /** Years per second of the time-lapse, from the bus. */
  yearsPerSecond = 0;
  private readonly stone = new Color(0.78, 0.74, 0.66);
  private readonly foam = new Color(0.85, 0.87, 0.86);
  private readonly off: (() => void)[] = [];

  constructor(private readonly t: FxTargets) {}

  setStoneColor(c: Color): void {
    this.stone.copy(c);
    this.t.particles()?.setDustColor(c);
  }

  dust(kind: DustKind, at: Vec3, size: number): void {
    this.t.particles()?.dust(kind, at, size);
  }

  splash(at: Vec3, size: number): void {
    const river = this.t.river();
    const y = river ? river.surfaceAt(at.z) : at.y;
    this.t.particles()?.splash({ x: at.x, y, z: at.z }, size, this.foam);
    river?.ripple(at.x, at.z, size);
  }

  chips(at: Vec3, count: number, kind: 'wood' | 'stone' | 'leaf'): void {
    this.t.particles()?.chips(at, count, kind === 'wood' ? WOOD : kind === 'leaf' ? LEAF : this.stone);
  }

  driftwood(amount: number): void {
    this.t.driftwood()?.setAmount(amount);
  }

  weather(rain: number, snow: number): void {
    this.forced.rain = clamp(rain, 0, 1);
    this.forced.snow = clamp(snow, 0, 1);
  }

  birds(presence: number): void {
    this.birdPresence = clamp(presence, 0, 1);
    this.t.birds()?.setPresence(this.ambientLife ? this.birdPresence : 0);
  }

  setAmbientLife(on: boolean): void {
    this.ambientLife = on;
    this.birds(this.birdPresence);
  }

  /** Called every frame: keeps an earthquake shaking while it lasts. */
  update(): void {
    if (this.quake > 0) this.t.sustainShake(this.quake);
  }

  listen(bus: Bus): void {
    this.off.push(
      bus.on('splash', (e) => this.splash(e.at, e.size)),
      bus.on('impact', (e) => {
        const s = clamp(0.35 + Math.sqrt(Math.max(e.energy, 0)) * 0.12, 0.3, 4);
        if (e.surface === 'stone') {
          this.dust('puff', e.at, s);
          this.chips(e.at, Math.round(4 + s * 6), 'stone');
        } else {
          const p = this.t.particles();
          if (p) {
            p.setDustColor(EARTH);
            p.dust('puff', e.at, s * 1.3);
            p.setDustColor(this.stone);
          }
        }
      }),
      bus.on('stone:land', (e) => {
        const s = clamp(0.25 + 0.22 * Math.sqrt(Math.max(e.mass, 0.05) * Math.max(e.count, 1)), 0.2, 2.5);
        this.dust('puff', e.at, s);
      }),
      bus.on('keystone:seat', (e) => this.dust('ring', e.at, 1.3)),
      bus.on('wedge:strike', (e) => this.chips(e.at, 8, 'wood')),
      bus.on('mark:tap', (e) => {
        this.chips(e.at, 4, 'stone');
        this.dust('trail', e.at, 0.3);
      }),
      bus.on('crack', (e) => this.dust('fall', e.at, 0.6)),
      bus.on('flood', (e) => {
        const d = clamp(e.drama, 0, 1);
        if (e.phase === 'rise' || e.phase === 'peak') {
          this.driftwood(0.3 + d * 0.7);
          this.weather(Math.max(this.forced.rain, 0.25 + d * 0.5), this.forced.snow);
        } else if (e.phase === 'fall') {
          this.driftwood(0.2 + d * 0.2);
        } else {
          this.driftwood(0);
          this.weather(0, this.forced.snow);
        }
      }),
      bus.on('quake', (e) => {
        if (e.phase === 'start') {
          this.quake = clamp(0.25 + e.pga * 2.5, 0.25, 0.95);
          this.t.shake(this.quake);
        } else this.quake = 0;
      }),
      bus.on('time:speed', (e) => {
        this.yearsPerSecond = Math.abs(e.yearsPerSecond);
      }),
    );
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
  }
}
