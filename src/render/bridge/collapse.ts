/**
 * The fall (DESIGN 2.6): half a second of the hinge mechanism in slow motion, then every stone of
 * the failing spans and piers becomes a rigid body. Splashes as stones reach the water (with a
 * moment of slow motion for the first of each span), impacts on the banks, wash-outs carried
 * downstream, and real time returning as the last stones sink.
 */
import { Quaternion, Vector3 } from 'three';
import type { Bus } from '../../core/bus';
import type { CollapseInfo, SpanCollapse, Vec2 } from '../../core/types';
import { clamp, clamp01 } from '../../core/math';
import { DENSITY } from './layout';
import { applyXf, mechanism, type Xf2 } from './mechanism';
import type { BridgeModel } from './model';
import { createDebris, simpleDebris, stoneBox, type DebrisSim } from './physics';

/** Seconds (scene time) the mechanism plays before the physics takes the stones. */
const KINEMATIC = 0.5;
/** Angular acceleration of the first bar, rad/s2: about 0.08 rad turned by the hand-over. */
const ALPHA = 0.64;
/** Give up waiting for the last stones after this long (scene seconds). */
const MAX_SECONDS = 12;

type Driver = { span: SpanCollapse; segment: number } | { pier: number; tilt: number };

interface Faller {
  readonly i: number;
  readonly driver: Driver;
  readonly start: number;
  phase: 'wait' | 'kinematic' | 'body' | 'rest' | 'sunk';
  /** Among the heaviest: a full rigid body (the rest fall without touching each other). */
  heavy: boolean;
  readonly prev: Vector3;
  wet: boolean;
  wetFor: number;
  lastSpeed: number;
  /** Seconds it has barely moved. */
  idle: number;
}

const _pos = new Vector3();
const _vel = new Vector3();
const _rot = new Quaternion();
const _a = new Vector3();
const _b = new Vector3();
const Z = new Vector3(0, 0, 1);

export class CollapseScene {
  slowMotion = 0.3;
  private t = 0;
  private sim: DebrisSim | null = null;
  private readonly light: DebrisSim;
  private simLoading = false;
  private readonly fallers: Faller[] = [];
  private readonly lastXf = new Map<SpanCollapse, Xf2[]>();
  private readonly splashedSpan = new Set<number>();
  private impactBudget = 0;
  private splashBudget = 0;
  private dipUntil = -1;
  private bodiesFrom = Infinity;
  private done: (() => void) | null = null;
  private readonly current: number;
  private readonly density: number;

  constructor(
    private readonly model: BridgeModel,
    private readonly info: CollapseInfo,
    private readonly bus: Bus,
    private readonly water: () => number,
    budget: number,
  ) {
    this.density = DENSITY[model.level.stone];
    this.current = info.cause === 'flood-wash' ? 2.6 : info.cause === 'flood-scour' ? 1.6 : 0.6;
    const g = model.geometry;
    const pierTilt = (p: number): number => {
      const x = g.piers[p]?.x ?? 0;
      const mid = g.spans.length > 0 ? (g.spans[0]!.left.x + g.spans[g.spans.length - 1]!.right.x) / 2 : 0;
      return x >= mid ? -1 : 1;
    };
    const taken = new Uint8Array(model.count);
    for (const sc of info.spans) {
      const joints = sc.hinges.map((h) => h.joint);
      model.stones.forEach((s, i) => {
        if (taken[i] || model.gone[i] || s.arcade) return;
        const ring = s.kind === 'voussoir' || s.kind === 'keystone';
        const si = ring ? s.span : s.follow[0];
        if (si !== sc.span) return;
        const v = ring ? s.voussoir : s.follow[1];
        // Stones outside the outer hinges stay on their supports; a wash-out takes everything.
        let segment = 0;
        if (joints.length > 0) {
          if (v < joints[0]! || (joints.length > 1 && v >= joints[joints.length - 1]!)) return;
          segment = joints.filter((j) => j <= v).length - 1;
        }
        taken[i] = 1;
        this.fallers.push({ i, driver: { span: sc, segment }, start: sc.delay, phase: 'wait', heavy: false, prev: new Vector3(), wet: false, wetFor: 0, lastSpeed: 0, idle: 0 });
      });
    }
    for (const p of info.piers) {
      const delay = Math.min(...info.spans.map((s) => s.delay), 0);
      model.stones.forEach((s, i) => {
        if (taken[i] || model.gone[i]) return;
        if (s.pier !== p && s.followPier !== p) return;
        taken[i] = 1;
        this.fallers.push({ i, driver: { pier: p, tilt: pierTilt(p) }, start: delay, phase: 'wait', heavy: false, prev: new Vector3(), wet: false, wetFor: 0, lastSpeed: 0, idle: 0 });
      });
    }
    // The rigid-body budget goes to the biggest stones; the small ones fall free.
    [...this.fallers].sort((p, q) => model.stones[q.i]!.volume - model.stones[p.i]!.volume).slice(0, budget).forEach((f) => (f.heavy = true));
    this.light = simpleDebris(model.layout.frame.ground);
    model.field.unbound();
  }

  /** Resolves when the last stone has come to rest or sunk. */
  play(): Promise<void> {
    this.bus.emit('collapse:start', { info: this.info });
    void this.loadSim();
    return new Promise((resolve) => {
      this.done = resolve;
      if (this.fallers.length === 0) this.finish();
    });
  }

  private async loadSim(): Promise<void> {
    if (this.simLoading) return;
    this.simLoading = true;
    const f = this.model.layout.frame;
    const sim = await createDebris(f.ground, f.x0 - 30, f.x1 + 30);
    if (!this.done) {
      sim.dispose();
      return;
    }
    // Standing stones the falling ones may land on: the supports and the ring left on them.
    const falling = new Set(this.fallers.map((x) => x.i));
    const m = this.model;
    const near = this.fallers.length > 0 ? this.extent() : [0, 0];
    let fixed = 0;
    m.stones.forEach((s, i) => {
      if (fixed >= 1500 || falling.has(i) || m.gone[i] || !m.laid[i] || s.material === 1) return;
      if (s.pivot.x < near[0]! - 2 || s.pivot.x > near[1]! + 2) return;
      // Only the outer stones of the standing work can be landed on.
      if (s.kind === 'spandrel' || s.kind === 'parapet' || s.kind === 'coping') return;
      const box = stoneBox(s, m.field.boxes, i);
      sim.addFixed(box, _a.set(s.pivot.x + m.base[i * 3]!, s.pivot.y + m.base[i * 3 + 1]!, s.pivot.z));
      fixed++;
    });
    // One empty step now builds the broad phase over the standing stones, before any stone needs it.
    sim.step(1 / 60, this.water(), 0);
    this.sim = sim;
  }

  private extent(): [number, number] {
    let lo = Infinity;
    let hi = -Infinity;
    for (const f of this.fallers) {
      const x = this.model.stones[f.i]!.pivot.x;
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    return [lo, hi];
  }

  update(dt: number): void {
    if (!this.done) return;
    this.t += dt;
    this.impactBudget = Math.min(6, this.impactBudget + dt * 10);
    this.splashBudget = Math.min(10, this.splashBudget + dt * 25);
    const water = this.water();
    // Each span's mechanism pose for this instant (null once it locks: keep the last one).
    for (const sc of this.info.spans) {
      const tk = clamp(this.t - sc.delay, 0, KINEMATIC);
      const xf = sc.hinges.length > 0 ? mechanism(sc.hinges.map((h) => h.at), sc.sense, 0.5 * ALPHA * tk * tk) : null;
      if (xf) this.lastXf.set(sc, xf);
    }
    let active = 0;
    // Hand stones to the physics a few hundred a frame, so a whole bridge going at once is no hitch.
    let handover = 150;
    for (const f of this.fallers) {
      if (f.phase === 'wait' && this.t >= f.start) f.phase = 'kinematic';
      if (f.phase === 'kinematic') {
        this.kinematic(f);
        if (this.t >= f.start + KINEMATIC && this.sim && handover > 0) {
          this.toBody(f);
          handover--;
        }
      } else if (f.phase === 'body') this.body(f, dt, water);
      if (f.phase !== 'rest' && f.phase !== 'sunk') active++;
    }
    if (this.sim && this.fallers.some((f) => f.phase === 'body')) {
      this.sim.step(dt, water, this.current);
      this.light.step(dt, water, this.current);
    }
    this.updateSlowMotion();
    if (active === 0 || this.t > MAX_SECONDS) this.finish();
  }

  private updateSlowMotion(): void {
    const firstBodies = this.bodiesFrom;
    let target = 0.3;
    if (this.t >= firstBodies) target = 0.3 + 0.7 * clamp01((this.t - firstBodies) / 2.5);
    if (this.t < this.dipUntil) target = Math.min(target, 0.5);
    this.slowMotion = target;
  }

  /** Pose during the mechanism: rigid with its bar, or a pier tilting over its foot as it sinks. */
  private kinematic(f: Faller): void {
    const m = this.model;
    const s = m.stones[f.i]!;
    const tk = clamp(this.t - f.start, 0, KINEMATIC + 0.6);
    const b = m.base;
    const p0: Vec2 = { x: s.pivot.x + b[f.i * 3]!, y: s.pivot.y + b[f.i * 3 + 1]! };
    const rot0 = b[f.i * 3 + 2]!;
    let p = p0;
    let angle = rot0;
    let dz = 0;
    const d = f.driver;
    if ('span' in d) {
      if (d.span.hinges.length === 0) {
        // Washed out: the whole span goes downstream with the water.
        dz = -0.5 * 4 * tk * tk;
        p = { x: p0.x, y: p0.y - 0.5 * 1.5 * tk * tk };
      } else {
        const xf = this.lastXf.get(d.span)?.[d.segment];
        if (xf) {
          p = applyXf(xf, p0);
          angle = rot0 + xf.angle;
        }
      }
    } else {
      const pier = m.geometry.piers[d.pier];
      if (pier) {
        const foot = { x: pier.x - (d.tilt * pier.width) / 2, y: pier.base };
        const xf: Xf2 = { about: foot, angle: d.tilt * 0.5 * 0.5 * tk * tk, move: { x: 0, y: -0.5 * 1.2 * tk * tk } };
        p = applyXf(xf, p0);
        angle = rot0 + xf.angle;
      }
    }
    f.prev.set(p.x, p.y, s.pivot.z + dz);
    _rot.setFromAxisAngle(Z, angle);
    m.field.setPose(f.i, p.x - s.pivot.x, p.y - s.pivot.y, dz, _rot.x, _rot.y, _rot.z, _rot.w, 1);
  }

  private simOf(f: Faller): DebrisSim {
    return f.heavy ? this.sim! : this.light;
  }

  private toBody(f: Faller): void {
    const sim = this.simOf(f);
    const m = this.model;
    const s = m.stones[f.i]!;
    // Velocity from the mechanism: pose now and a moment later.
    _a.copy(f.prev);
    const t = this.t;
    this.t = t + 0.01;
    this.kinematic(f);
    this.t = t;
    _b.copy(f.prev);
    const vel = _b.clone().sub(_a).multiplyScalar(100);
    this.kinematic(f);
    m.field.pose(f.i, _pos, _rot);
    const box = stoneBox(s, m.field.boxes, f.i);
    // A little spin of its own, so no two stones fall alike.
    const spin = new Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.8);
    sim.add({ id: f.i, pos: _a.clone(), rot: _rot.clone(), vel, spin, box, mass: s.volume * this.density });
    f.phase = 'body';
    f.lastSpeed = vel.length();
    this.bodiesFrom = Math.min(this.bodiesFrom, this.t);
  }

  private body(f: Faller, dt: number, water: number): void {
    const sim = this.simOf(f);
    const m = this.model;
    const s = m.stones[f.i]!;
    sim.read(f.i, _pos, _rot, _vel);
    m.field.setPose(f.i, _pos.x - s.pivot.x, _pos.y - s.pivot.y, _pos.z - s.pivot.z, _rot.x, _rot.y, _rot.z, _rot.w, 1);
    const mass = s.volume * this.density;
    const speed = _vel.length();
    if (!f.wet && _pos.y < water) {
      f.wet = true;
      if (this.splashBudget >= 1) {
        this.splashBudget -= 1;
        this.bus.emit('splash', { at: { x: _pos.x, y: water, z: _pos.z }, size: clamp(mass * 1.5, 0.3, 3) });
      }
      const span = 'span' in f.driver ? f.driver.span.span : -1 - f.driver.pier;
      if (!this.splashedSpan.has(span)) {
        this.splashedSpan.add(span);
        this.dipUntil = this.t + 0.6;
      }
    }
    // A sudden loss of speed above the water is a hit on the bank or on other stones.
    const dv = f.lastSpeed - speed;
    if (!f.wet && dv > 2.5 && this.impactBudget >= 1) {
      this.impactBudget -= 1;
      const ground = m.layout.frame.ground.at(_pos.x);
      this.bus.emit('impact', { at: { x: _pos.x, y: _pos.y, z: _pos.z }, energy: 0.5 * mass * dv * dv, surface: _pos.y < ground + 1 ? 'ground' : 'stone' });
    }
    f.lastSpeed = speed;
    f.idle = speed < 0.15 ? f.idle + dt : 0;
    if (f.wet) {
      f.wetFor += dt;
      // Under water the stones settle on the bed and are lost to sight: let them go.
      if (f.wetFor > 2.5 || (f.wetFor > 1 && sim.sleeping(f.i))) {
        sim.remove(f.i);
        m.gone[f.i] = 1;
        m.writePose(f.i);
        f.phase = 'sunk';
      }
    } else if (sim.sleeping(f.i) || f.idle > 1) {
      sim.remove(f.i);
      f.phase = 'rest';
    }
  }

  private finish(): void {
    if (!this.done) return;
    const done = this.done;
    this.done = null;
    this.slowMotion = 1;
    this.sim?.dispose();
    this.sim = null;
    this.light.dispose();
    this.bus.emit('collapse:end', {});
    done();
  }

  dispose(): void {
    this.finish();
  }
}
