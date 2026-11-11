/**
 * Building the bridge (DESIGN 2.3): the piers and the low courses of the abutments rise by
 * themselves while the centering goes up; the ring is laid while the player holds, from both
 * springings towards the crown at the pace of pacing.ts; the main keystone goes in from the
 * hoist; then the walls, parapets and paving finish in a quick flourish.
 */
import { Quaternion, Vector3 } from 'three';
import type { Bus, StonePart } from '../../core/bus';
import type { BuildProgress } from '../../core/contracts';
import type { Vec3 } from '../../core/types';
import { clamp } from '../../core/math';
import type { Centering } from './centering';
import { Flights } from './flight';
import { Keystone } from './keystone';
import { DENSITY } from './layout';
import type { BridgeModel } from './model';
import { FIRST_COUNT, stepPace, type Pace } from './pacing';
import { PART_OF } from './types';

export type BuildState = 'idle' | 'raising' | 'raised' | 'laying' | 'keystone' | 'finishing' | 'done';

interface Batch {
  count: number;
  mass: number;
  heaviest: number;
  at: Vec3;
  part: StonePart;
}

const _from = new Vector3();
const _rot = new Quaternion();
const _axis = new Vector3();

export class Build {
  state: BuildState = 'idle';
  private readonly flights: Flights;
  private readonly support: number[];
  private readonly ring: number[];
  private readonly rest: number[];
  private readonly keystoneIndex: number;
  private readonly density: number;
  private started = { support: 0, ring: 0, rest: 0 };
  private clock = { support: 0, rest: 0 };
  private landed = 0;
  private ringLanded = 0;
  private readonly pace: Pace = { laid: 0, momentum: 0 };
  private creakIn = 2;
  private batch: Batch | null = null;
  private keystone: Keystone | null = null;
  private onRaised: (() => void) | null = null;
  private onFinished: (() => void) | null = null;
  private onSeat: ((at: Vec3) => void) | null = null;

  constructor(
    private readonly model: BridgeModel,
    private readonly centering: Centering,
    private readonly bus: Bus,
    private readonly rng: () => number,
  ) {
    this.flights = new Flights(model);
    const { stones, phase, mainSpan } = model.layout;
    this.density = DENSITY[model.level.stone];
    const all = stones.map((_, i) => i);
    const by = (key: (i: number) => number) => (a: number, b: number) => key(a) - key(b);
    // Course by course across every pier and abutment at once.
    this.support = all.filter((i) => phase[i] === 'support').sort(by((i) => stones[i]!.pivot.y));
    this.keystoneIndex = all.find((i) => stones[i]!.kind === 'keystone' && stones[i]!.span === mainSpan && !stones[i]!.arcade) ?? -1;
    this.ring = all.filter((i) => phase[i] === 'ring' && i !== this.keystoneIndex).sort(by((i) => stones[i]!.order));
    this.rest = all.filter((i) => phase[i] === 'finish').sort(by((i) => stones[i]!.order));
  }

  get progress(): BuildProgress {
    const ringDone = this.ringLanded >= this.ring.length;
    return {
      laid: this.landed,
      total: this.model.count,
      awaitingKeystone: ringDone && !(this.keystone?.seated ?? false) && this.state !== 'done' && this.state !== 'finishing',
      complete: this.state === 'done',
    };
  }

  /** Piers rise course by course; the centering goes up under them. */
  raise(): Promise<void> {
    if (this.state !== 'idle') return Promise.resolve();
    this.state = 'raising';
    return new Promise((resolve) => {
      this.onRaised = resolve;
    });
  }

  /** The player holds (or not) the build control for dt seconds. */
  lay(dt: number, holding: boolean): BuildProgress {
    if (this.state === 'raised') this.state = 'laying';
    if (this.state !== 'laying') return this.progress;
    const total = this.ring.length;
    const n = stepPace(this.pace, dt, holding, total);
    for (let k = 0; k < n && this.started.ring < total; k++) this.launchRing(this.ring[this.started.ring++]!);
    if (holding && this.started.ring < total) {
      this.creakIn -= dt;
      if (this.creakIn <= 0) {
        this.creakIn = 1.5 + this.rng() * 1.5;
        const last = this.model.stones[this.ring[Math.max(0, this.started.ring - 1)]!]!;
        this.bus.emit('timber:creak', { at: this.centering.pointOn(last.span), strain: clamp(this.started.ring / total, 0.1, 1) });
      }
    }
    return this.progress;
  }

  private launchRing(i: number): void {
    const s = this.model.stones[i]!;
    const geo = this.model.layout.frame.spans.find((f) => f.index === s.span)?.geo;
    // Out from the middle of the arch and up: the stone swings in over the centering.
    const cx = geo ? geo.crown.x : s.pivot.x;
    const cy = geo ? geo.left.y : s.pivot.y - 1;
    const dx = s.pivot.x - cx;
    const dy = s.pivot.y - cy;
    const l = Math.hypot(dx, dy) || 1;
    _from.set((dx / l) * 0.7, (dy / l) * 0.7 + 1.0, Math.sign(s.pivot.z || 1) * 0.3);
    _axis.set(this.rng() - 0.5, this.rng() - 0.5, 2 * (this.rng() - 0.5)).normalize();
    _rot.setFromAxisAngle(_axis, 0.35 * this.rng());
    // The first ten take their time; then the flights shorten with the pace.
    const quick = clamp((this.started.ring - FIRST_COUNT) / 120, 0, 1);
    this.flights.start(i, _from, _rot, 0.62 - 0.24 * quick, 0.3);
  }

  private launchPlain(i: number, rise: number, dur: number): void {
    const s = this.model.stones[i]!;
    const out = s.shape.plane === 'xy' ? Math.sign(s.pivot.z || 1) * 0.25 : 0;
    _from.set(0, rise, out);
    _axis.set(this.rng() - 0.5, this.rng() - 0.5, this.rng() - 0.5).normalize();
    _rot.setFromAxisAngle(_axis, 0.15 * this.rng());
    this.flights.start(i, _from, _rot, dur, rise * 0.2);
  }

  /** Hang the main keystone from the hoist. */
  hangKeystone(): { span: number; seat: Vec3 } {
    const span = this.model.layout.mainSpan;
    if (this.keystoneIndex < 0) return { span, seat: { x: 0, y: 0, z: 0 } };
    if (!this.keystone) {
      this.flights.finishAll((i) => this.land(i));
      this.keystone = new Keystone(this.model, this.centering, this.keystoneIndex, span);
      this.state = 'keystone';
    }
    return { span, seat: { ...this.keystone.seat } };
  }

  moveKeystone(x: number, y: number): void {
    this.keystone?.move(x, y);
  }

  dropKeystone(): Promise<boolean> {
    if (!this.keystone) return Promise.resolve(false);
    return this.keystone.drop();
  }

  /** Called with the seat position when the keystone seats. */
  set seatListener(fn: ((at: Vec3) => void) | null) {
    this.onSeat = fn;
  }

  /** Spandrels, fill, parapets and paving complete by themselves. */
  finish(): Promise<void> {
    if (this.state === 'done') return Promise.resolve();
    // Whatever is still unlaid of the ring goes in first (a game that skips ahead).
    while (this.started.ring < this.ring.length) this.launchRing(this.ring[this.started.ring++]!);
    if (this.keystoneIndex >= 0 && !(this.keystone?.seated ?? false)) {
      this.keystone?.abandon();
      this.model.setLaid(this.keystoneIndex, true);
      this.landed++;
    }
    this.centering.setHoist(false);
    this.state = 'finishing';
    return new Promise((resolve) => {
      this.onFinished = resolve;
    });
  }

  /** Land everything at once (the game jumped past the build). */
  complete(): void {
    for (const list of [this.support, this.ring, this.rest]) for (const i of list) this.model.setLaid(i, true);
    this.keystone?.abandon();
    if (this.keystoneIndex >= 0) this.model.setLaid(this.keystoneIndex, true);
    this.flights.finishAll(() => undefined);
    this.started = { support: this.support.length, ring: this.ring.length, rest: this.rest.length };
    this.landed = this.model.count;
    this.ringLanded = this.ring.length;
    this.centering.setHoist(false);
    this.centering.raiseNow();
    this.state = 'done';
  }

  update(dt: number): void {
    if (this.state === 'raising') this.updateRaise(dt);
    if (this.state === 'finishing') this.updateFinish(dt);
    this.flights.update(dt, (i) => this.land(i));
    if (this.keystone?.update(dt)) {
      this.landed++;
      const s = this.keystone.seat;
      this.bus.emit('keystone:seat', { at: { x: s.x, y: s.y, z: this.model.geometry.width / 2 }, span: this.keystone.span });
      this.onSeat?.(s);
    }
    this.flushBatch();
  }

  private updateRaise(dt: number): void {
    const n = this.support.length;
    const seconds = clamp(1.5 + n / 800, 1.8, 3.2);
    this.clock.support += dt;
    const want = Math.min(n, Math.ceil((this.clock.support / seconds) * n));
    while (this.started.support < want) this.launchPlain(this.support[this.started.support++]!, 0.6, 0.32);
    if (this.clock.support > seconds * 0.55) this.centering.startRaise();
    if (this.started.support >= n && !this.flights.busy && this.centering.raised) {
      this.state = 'raised';
      this.onRaised?.();
      this.onRaised = null;
    }
  }

  private updateFinish(dt: number): void {
    const n = this.rest.length;
    const seconds = clamp(2.2 + n / 1500, 2.5, 4);
    this.clock.rest += dt;
    const want = Math.min(n, Math.ceil((this.clock.rest / seconds) * n));
    while (this.started.rest < want) this.launchPlain(this.rest[this.started.rest++]!, 0.7, 0.4);
    if (this.started.rest >= n && !this.flights.busy) {
      this.state = 'done';
      this.onFinished?.();
      this.onFinished = null;
    }
  }

  private land(i: number): void {
    const s = this.model.stones[i]!;
    const mass = s.volume * this.density;
    this.landed++;
    if (s.kind === 'voussoir' || s.kind === 'keystone') {
      this.ringLanded++;
      this.centering.dip(s.span, mass);
    }
    const at = { x: s.pivot.x, y: s.pivot.y, z: s.pivot.z };
    const b = this.batch;
    if (!b) {
      this.batch = { count: 1, mass, heaviest: mass, at, part: PART_OF[s.kind] };
      return;
    }
    b.count++;
    b.mass += mass;
    if (mass > b.heaviest) {
      b.heaviest = mass;
      b.at = at;
      b.part = PART_OF[s.kind];
    }
  }

  /** One thud per frame: a flurry of stones is one event with a count. */
  private flushBatch(): void {
    const b = this.batch;
    if (!b) return;
    this.batch = null;
    this.bus.emit('stone:land', { at: b.at, mass: b.count > 1 ? b.mass / b.count : b.mass, part: b.part, count: b.count });
  }

  /** Resolve whatever the game is still waiting for, so a scene change never leaves it hanging. */
  dispose(): void {
    this.onRaised?.();
    this.onFinished?.();
    this.onRaised = null;
    this.onFinished = null;
    this.onSeat = null;
  }
}
