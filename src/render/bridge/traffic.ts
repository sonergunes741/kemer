/**
 * Traffic over the deck: a sparse, natural flow for the era in two lanes both ways, and staged
 * crossings (a caravan led by a donkey, a cannon drawn by oxen with soldiers beside it). Each
 * party walks the road line; feet and wheels report to the bus at a limited rate.
 */
import { Group, Vector3, type Object3D } from 'three';
import type { Bus } from '../../core/bus';
import type { ActorKind, TrafficEra } from '../../core/types';
import type { ModelId } from '../../core/assets';
import { Rig, type ActorLibrary } from './actors';
import type { BridgeFrame } from './frame';
import { PARAPET_T } from './layoutWall';

/** Walking pace of each kind, m/s. */
const SPEED: Readonly<Record<ActorKind, number>> = {
  villager: 1.3,
  donkey: 1.2,
  'ox-cart': 0.9,
  caravan: 1.1,
  rider: 2.0,
  army: 1.4,
  cannon: 0.85,
  carriage: 2.4,
  truck: 3.5,
  cyclist: 3.5,
};

/** Half the width each kind takes on the road, metres (to keep it off the parapets). */
const HALF: Readonly<Record<ActorKind, number>> = {
  villager: 0.3,
  donkey: 0.35,
  'ox-cart': 0.85,
  caravan: 0.5,
  rider: 0.35,
  army: 0.7,
  cannon: 1.0,
  carriage: 0.8,
  truck: 1.1,
  cyclist: 0.3,
};

/** Approach beyond each end of the deck, metres: parties appear and vanish out there. */
const APPROACH = 9;
const STEPS_PER_SECOND = 7;

interface Slot {
  readonly model: ModelId;
  /** Metres behind the head of the party, and across from its lane. */
  readonly back: number;
  readonly side: number;
}

interface Unit {
  readonly rig: Rig;
  readonly back: number;
  readonly side: number;
}

interface Party {
  readonly kind: ActorKind;
  readonly units: Unit[];
  readonly dir: 1 | -1;
  readonly lane: number;
  readonly speed: number;
  readonly length: number;
  s: number;
  entered: boolean;
  mid: boolean;
  exited: boolean;
  readonly done: (() => void) | null;
}

export class Traffic {
  readonly group = new Group();
  private readonly parties: Party[] = [];
  private era: TrafficEra | null = null;
  private density = 0;
  private nextIn = 2;
  private stepBudget = 0;
  private alive = true;

  constructor(
    private readonly library: ActorLibrary,
    private readonly frame: BridgeFrame,
    private readonly width: number,
    private readonly bus: Bus,
    private readonly rng: () => number,
  ) {
    this.group.name = 'kemer-traffic';
  }

  setTraffic(era: TrafficEra | null, density: number): void {
    this.era = era;
    this.density = Math.max(0, Math.min(1, density));
    this.nextIn = Math.min(this.nextIn, 1 + this.rng() * 2);
  }

  /** One staged crossing; resolves when its last member has left the bridge. */
  cross(kind: ActorKind, count: number, seconds: number): Promise<void> {
    return new Promise((resolve) => {
      void this.spawn(kind, Math.max(1, Math.round(count)), this.rng() < 0.5 ? 1 : -1, true, seconds, resolve);
    });
  }

  private slots(kind: ActorKind, count: number, hitch: (id: ModelId) => Vector3[]): Slot[] {
    const out: Slot[] = [];
    const room = Math.max(0.2, this.width / 2 - PARAPET_T - 0.35);
    const side = (z: number): number => Math.max(-room, Math.min(room, z));
    const hitched = (vehicle: ModelId, animal: ModelId, back: number, pairs: number): void => {
      const points = hitch(vehicle);
      const front = Math.max(...points.map((p) => p.x), 2);
      for (let k = 0; k < pairs; k++) {
        for (const p of points) out.push({ model: animal, back: back - front - 1.1 - k * 2.4, side: p.z });
      }
      out.push({ model: vehicle, back, side: 0 });
    };
    for (let n = 0; n < count; n++) {
      const tail = out.length > 0 ? Math.max(...out.map((s) => s.back)) + 2 : 0;
      switch (kind) {
        case 'villager':
          out.push({ model: 'actor-villager', back: tail + this.rng() * 1.5, side: side((this.rng() - 0.5) * 0.4) });
          break;
        case 'donkey':
          out.push({ model: 'actor-villager', back: tail, side: side(0.45) }, { model: 'actor-donkey', back: tail + 0.9, side: 0 });
          break;
        case 'ox-cart':
          hitched('actor-ox-cart', 'actor-ox', tail + 3.6, 1);
          out.push({ model: 'actor-villager', back: tail + 0.6, side: side(1.0) });
          break;
        case 'caravan':
          // The donkey leads the string of camels.
          if (n === 0) out.push({ model: 'actor-villager', back: 0, side: side(0.45) }, { model: 'actor-donkey', back: 0.6, side: 0 });
          out.push({ model: 'actor-caravan', back: (n === 0 ? 2.2 : tail) + 4.4, side: 0 });
          break;
        case 'cannon': {
          const gun = tail + 5.8;
          hitched('actor-cannon', 'actor-ox', gun, 2);
          for (const z of [1, -1]) {
            out.push({ model: 'actor-army', back: gun - 0.8, side: side(z * 1.05) });
            out.push({ model: 'actor-army', back: gun + 2.2, side: side(z * 0.45) });
          }
          break;
        }
        case 'army':
          // Soldiers march in ranks of two.
          out.push({ model: 'actor-army', back: Math.floor(n / 2) * 1.1, side: side(n % 2 === 0 ? 0.4 : -0.4) });
          break;
        case 'carriage':
          hitched('actor-carriage', 'actor-horse', tail + 3.9, 1);
          break;
        default:
          out.push({ model: `actor-${kind}`, back: tail, side: 0 });
      }
    }
    return out;
  }

  private async spawn(kind: ActorKind, count: number, dir: 1 | -1, staged: boolean, seconds: number, done: (() => void) | null): Promise<void> {
    const ids = new Set<ModelId>(this.slots(kind, count, () => [new Vector3(2, 0, -0.5), new Vector3(2, 0, 0.5)]).map((s) => s.model));
    const templates = new Map<ModelId, Object3D>();
    await Promise.all(
      [...ids].map(async (id) => {
        const t = await this.library.get(id);
        if (t) templates.set(id, t);
      }),
    );
    if (!this.alive) {
      done?.();
      return;
    }
    const hitch = (id: ModelId): Vector3[] => {
      const t = templates.get(id);
      const pts: Vector3[] = [];
      t?.traverse((o) => {
        if (o.name.startsWith('hitch')) pts.push(o.position.clone());
      });
      return pts.length > 0 ? pts : [new Vector3(2, 0, 0)];
    };
    const units: Unit[] = [];
    for (const slot of this.slots(kind, count, hitch)) {
      const t = templates.get(slot.model);
      if (!t) continue;
      const rig = new Rig(t, 1);
      this.group.add(rig.root);
      units.push({ rig, back: slot.back, side: slot.side });
    }
    if (units.length === 0) {
      done?.();
      return;
    }
    const length = Math.max(...units.map((u) => u.back)) + 2;
    const room = Math.max(0, this.width / 2 - PARAPET_T - HALF[kind] - 0.1);
    // Staged crossings take the crown of the road; everyday traffic keeps to its side.
    const lane = staged ? 0 : -dir * Math.min(room, this.width / 4);
    const run = this.frame.x1 - this.frame.x0 + 2 * APPROACH + length;
    const speed = staged && seconds > 0 ? Math.max(0.3, run / seconds) : SPEED[kind] * (0.85 + this.rng() * 0.3);
    const party: Party = { kind, units, dir, lane, speed, length, s: 0, entered: false, mid: false, exited: false, done };
    this.parties.push(party);
    this.place(party, 0);
  }

  update(dt: number): void {
    this.stepBudget = Math.min(3, this.stepBudget + dt * STEPS_PER_SECOND);
    if (this.era && this.density > 0) {
      this.nextIn -= dt;
      const room = this.parties.length < 1 + Math.round(this.density * 4);
      if (this.nextIn <= 0 && room) {
        const kinds = this.era.actors;
        const kind = kinds[Math.floor(this.rng() * kinds.length)];
        if (kind) void this.spawn(kind, kind === 'villager' ? 1 + Math.floor(this.rng() * 3) : kind === 'army' ? 6 : 1, this.rng() < 0.5 ? 1 : -1, false, 0, null);
        this.nextIn = (16 - 12 * this.density) * (0.6 + 0.8 * this.rng());
      }
    }
    for (let k = this.parties.length - 1; k >= 0; k--) {
      const p = this.parties[k]!;
      const d = p.speed * dt;
      p.s += d;
      this.place(p, d);
      if (p.s - p.length > this.frame.x1 - this.frame.x0 + 2 * APPROACH) {
        for (const u of p.units) this.group.remove(u.rig.root);
        this.parties.splice(k, 1);
        p.done?.();
      }
    }
  }

  private xAt(p: Party, s: number): number {
    return p.dir > 0 ? this.frame.x0 - APPROACH + s : this.frame.x1 + APPROACH - s;
  }

  private place(p: Party, d: number): void {
    const f = this.frame;
    for (const u of p.units) {
      const x = this.xAt(p, p.s - u.back);
      const y = f.deck.at(x);
      const slope = (f.deck.at(x + 0.5) - f.deck.at(x - 0.5)) / 1;
      const root = u.rig.root;
      root.position.set(x, y, p.lane + u.side * p.dir);
      root.rotation.set(0, p.dir > 0 ? 0 : Math.PI, Math.atan(slope * p.dir), 'YXZ');
      const onDeck = x >= f.x0 && x <= f.x1;
      if (u.rig.walk(d) && onDeck && this.stepBudget >= 1) {
        this.stepBudget -= 1;
        this.bus.emit('traffic:step', { kind: p.kind, at: { x, y, z: root.position.z } });
      }
    }
    const head = this.xAt(p, p.s);
    const tail = this.xAt(p, p.s - p.length);
    const mid = (f.x0 + f.x1) / 2;
    const at = (x: number) => ({ x, y: f.deck.at(x), z: p.lane });
    const inside = (x: number): boolean => x >= f.x0 && x <= f.x1;
    if (!p.entered && inside(head)) {
      p.entered = true;
      this.bus.emit('traffic:pass', { kind: p.kind, at: at(head), phase: 'enter' });
    }
    if (!p.mid && (p.dir > 0 ? head >= mid : head <= mid)) {
      p.mid = true;
      this.bus.emit('traffic:pass', { kind: p.kind, at: at(mid), phase: 'mid' });
    }
    if (p.entered && !p.exited && !inside(tail) && (p.dir > 0 ? tail > f.x1 : tail < f.x0)) {
      p.exited = true;
      this.bus.emit('traffic:pass', { kind: p.kind, at: at(tail), phase: 'exit' });
    }
  }

  /** Everything off the road at once (a scene change). */
  clear(): void {
    for (const p of this.parties) {
      for (const u of p.units) this.group.remove(u.rig.root);
      p.done?.();
    }
    this.parties.length = 0;
  }

  dispose(): void {
    this.alive = false;
    this.clear();
  }
}
