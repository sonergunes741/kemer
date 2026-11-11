/**
 * The event bus: physical things that happen in the scene, announced once and heard by whoever
 * cares (audio makes the sound, the world raises the dust, the UI flashes a mark). Modules never
 * call each other for these; they emit and subscribe here.
 *
 * Positions are world coordinates (see core/types.ts for the frames).
 */
import type { ActorKind, CollapseInfo, Vec3 } from './types';
import { log } from './log';

export type StonePart = 'pier' | 'voussoir' | 'keystone' | 'spandrel' | 'parapet' | 'paving';

export interface BusEvents {
  /** A stone has come to rest in the work. `mass` in tonnes; `count` stones landed together in a flurry. */
  'stone:land': { at: Vec3; mass: number; part: StonePart; count: number };
  /** The main keystone has seated. */
  'keystone:seat': { at: Vec3; span: number };
  /** One chisel tap while the family mark is cut. */
  'mark:tap': { at: Vec3; n: number };
  /** Timber centering goes up under a span. */
  'centering:raise': { at: Vec3; span: number };
  /** A wedge is knocked out; `left` wedges remain. */
  'wedge:strike': { at: Vec3; left: number };
  /** The centering of a span lets go and falls. */
  'centering:fall': { at: Vec3; span: number };
  /** Timber creaks under load (while stones are laid) : 0..1 strain. */
  'timber:creak': { at: Vec3; strain: number };
  /** The ring takes its own weight for the first time. `drop` in metres. */
  'arch:settle': { at: Vec3; span: number; drop: number };
  /** Anything hits the river. `size` roughly metres across. */
  splash: { at: Vec3; size: number };
  /** Debris hits ground or stone. `energy` roughly kJ. */
  impact: { at: Vec3; energy: number; surface: 'ground' | 'stone' };
  /** A joint opens. */
  crack: { at: Vec3 };
  'collapse:start': { info: CollapseInfo };
  'collapse:end': Record<string, never>;
  /** Flood phases, with the water level at the bridge in metres above normal. */
  flood: { phase: 'rise' | 'peak' | 'fall' | 'end'; level: number; drama: number };
  /** Earthquake phases, pga as a fraction of g. */
  quake: { phase: 'start' | 'end'; pga: number };
  /** Something heavy or lively crosses. */
  'traffic:pass': { kind: ActorKind; at: Vec3; phase: 'enter' | 'mid' | 'exit' };
  /** A footstep, hoof or wheel on the deck (rate-limited by the emitter). */
  'traffic:step': { kind: ActorKind; at: Vec3 };
  /** The time-lapse speed changed: years per second of real time. */
  'time:speed': { yearsPerSecond: number };
  /** A seal is stamped on the result screen. */
  'seal:stamp': { which: 'standing' | 'lean' | 'unrepaired' | 'masterwork' };
}

type Listener<K extends keyof BusEvents> = (payload: BusEvents[K]) => void;

export class Bus {
  private readonly listeners = new Map<keyof BusEvents, Set<Listener<never>>>();

  on<K extends keyof BusEvents>(type: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as Listener<never>);
    return () => {
      set.delete(listener as Listener<never>);
    };
  }

  emit<K extends keyof BusEvents>(type: K, payload: BusEvents[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of set) {
      try {
        (listener as Listener<K>)(payload);
      } catch (err) {
        // A broken listener must never break the scene.
        log.once(`bus:${type}`, 'bus', `listener for ${type} threw`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
