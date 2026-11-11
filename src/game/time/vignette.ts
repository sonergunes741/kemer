/**
 * One notable event played out at near real time (DESIGN 2.5): a great flood rising, peaking and
 * draining; an earthquake; an exceptional crossing. The chronicle has already decided the year;
 * the vignette shows it. When the year ends in a collapse, the vignette hands over at the moment
 * the force is greatest (the flood's peak, the strongest shaking, the load at mid-span).
 */
import type { WaterState } from '../../core/contracts';
import { lerp } from '../../core/math';
import type { ActorKind, ChronicleEvent, CollapseInfo, LevelDef } from '../../core/types';
import type { SceneState } from '../scene';
import { hazardCaption } from '../text';
import type { GameDeps } from '../types';
import type { Beat } from './beats';
import { floodEnvelope, floodWater } from './water';

type Flood = Extract<ChronicleEvent, { kind: 'flood' }>;
type Quake = Extract<ChronicleEvent, { kind: 'quake' }>;
type Load = Extract<ChronicleEvent, { kind: 'load' }>;

export interface VignetteHost {
  readonly deps: GameDeps;
  readonly scene: SceneState;
  readonly level: LevelDef;
  /** Safety of the bridge before the event, for the şakül. */
  readonly safety: number;
  /** Camera shake (ignored with reduced motion). */
  shake(amount: number): void;
}

export type VignetteState = 'playing' | 'done' | 'collapse';

const CROWD: Partial<Record<ActorKind, number>> = { caravan: 7, army: 9, cannon: 2, 'ox-cart': 3, truck: 2 };

export class Vignette {
  readonly caption: string | null;
  /** What the gauge shows right now, and the lowest it went. */
  safety: number;
  lowest: number;
  readonly collapse: CollapseInfo | null;
  private t = 0;
  private readonly seconds: number;
  private readonly flood: Flood | null;
  private readonly quake: Quake | null;
  private readonly load: Load | null;
  private readonly base: WaterState;
  private sent = new Set<string>();
  private crossed = false;
  private nextShake = 0;

  constructor(
    private readonly host: VignetteHost,
    readonly beat: Beat,
    events: readonly ChronicleEvent[],
  ) {
    this.flood = (events.find((e) => e.kind === 'flood') as Flood | undefined) ?? null;
    this.quake = (events.find((e) => e.kind === 'quake') as Quake | undefined) ?? null;
    this.load = (events.find((e) => e.kind === 'load') as Load | undefined) ?? null;
    const fell = events.find((e) => e.kind === 'collapse');
    this.collapse = fell && fell.kind === 'collapse' ? fell.info : null;
    this.base = host.scene.water;
    this.safety = host.safety;
    this.lowest = host.safety;
    const kind = beat.kind === 'flood' || beat.kind === 'quake' || beat.kind === 'load' ? beat.kind : 'flood';
    const hazard = this.flood?.hazard ?? this.quake?.hazard ?? this.load?.hazard;
    this.caption = hazardCaption(beat.whole, hazard, kind);
    this.seconds = this.quake ? 4.2 : this.load ? 9 : 4.6 + 1.4 * beat.drama;
    if (this.load) this.startCrossing(this.load);
  }

  /** True when the year held anything worth playing. */
  get empty(): boolean {
    return !this.flood && !this.quake && !this.load && !this.collapse;
  }

  update(dt: number): VignetteState {
    this.t += dt;
    if (this.quake) this.shaking(this.quake);
    else if (this.load) this.crossing(this.load);
    else if (this.flood) this.flooding(this.flood);
    this.lowest = Math.min(this.lowest, this.safety);
    if (this.collapse && this.t >= this.fallAt()) return 'collapse';
    return this.t >= this.seconds && (!this.load || this.crossed) ? 'done' : 'playing';
  }

  private fallAt(): number {
    if (this.quake) return 1.1;
    if (this.load) return 3.6;
    return this.seconds * 0.34 + 0.7;
  }

  private once(key: string, fn: () => void): void {
    if (this.sent.has(key)) return;
    this.sent.add(key);
    fn();
  }

  private flooding(f: Flood): void {
    const { deps, scene } = this.host;
    const e = floodEnvelope(this.t, this.seconds);
    // A flood that takes the bridge stays at its peak; the water falls after the fall.
    const k = this.collapse ? Math.max(e, this.t > this.seconds * 0.34 ? 1 : e) : e;
    scene.setWater(floodWater(f, k, this.base));
    deps.world.fx.driftwood(f.debris * k);
    this.safety = lerp(this.host.safety, Math.min(this.host.safety, f.safety), k);
    const peak = this.seconds * 0.34;
    this.once('rise', () => deps.bus.emit('flood', { phase: 'rise', level: f.level * 0.4, drama: f.drama }));
    if (this.t >= peak) this.once('peak', () => deps.bus.emit('flood', { phase: 'peak', level: f.level, drama: f.drama }));
    if (this.t >= this.seconds * 0.64 && !this.collapse) this.once('fall', () => deps.bus.emit('flood', { phase: 'fall', level: f.level * 0.6, drama: f.drama }));
    if (this.t >= this.seconds && !this.collapse) {
      this.once('end', () => {
        deps.bus.emit('flood', { phase: 'end', level: 0, drama: f.drama });
        deps.world.fx.driftwood(0);
      });
    }
  }

  private shaking(q: Quake): void {
    const { deps } = this.host;
    const strength = q.capacity > 0 ? q.pga / q.capacity : 1;
    if (this.t >= 0.25) {
      this.once('start', () => {
        deps.bus.emit('quake', { phase: 'start', pga: q.pga });
        deps.bridge.tremor(Math.min(1.5, strength));
      });
    }
    if (this.t >= 0.25 && this.t < 2.8 && this.t >= this.nextShake) {
      this.nextShake = this.t + 0.35;
      const fade = 1 - (this.t - 0.25) / 2.6;
      this.host.shake(Math.min(0.9, 0.25 + 0.6 * strength) * Math.max(0.2, fade));
    }
    const margin = q.pga > 0 ? q.capacity / q.pga : this.host.safety;
    const live = this.t > 0.25 && this.t < 2.8 ? 1 : 0;
    this.safety = lerp(this.host.safety, Math.min(this.host.safety, margin), live);
    if (this.t >= 2.8) this.once('end', () => deps.bus.emit('quake', { phase: 'end', pga: q.pga }));
  }

  private startCrossing(l: Load): void {
    const actor = l.hazard.kind === 'load' ? l.hazard.actor : 'caravan';
    void this.host.deps.bridge.cross(actor, CROWD[actor] ?? 3, 7).then(() => (this.crossed = true));
  }

  private crossing(l: Load): void {
    // The load is on the span between about a third and two thirds of the crossing.
    const on = this.t > 2.2 && this.t < 5.5 ? 1 : 0;
    const margin = l.axle > 0 ? l.capacity / l.axle : this.host.safety;
    this.safety = lerp(this.host.safety, Math.min(this.host.safety, margin), on);
    if (this.t > 12) this.crossed = true;
  }
}
