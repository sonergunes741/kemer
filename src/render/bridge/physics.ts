/**
 * Rigid bodies for the falling stones. Rapier is imported only when a collapse needs it (and can
 * be warmed during the time-lapse). If it cannot load, a small built-in integrator takes over:
 * stones fall, tumble, hit the ground line and sink, but do not collide with each other.
 */
import { Quaternion, Vector3 } from 'three';
import { log } from '../../core/log';
import type { Profile } from './poly';
import type { StoneSpec } from './types';

type RapierModule = typeof import('@dimforge/rapier3d-compat');
type RWorld = InstanceType<RapierModule['World']>;
type RBody = ReturnType<RWorld['createRigidBody']>;

const STEP = 1 / 60;
/** Never more than this many steps in one frame: a slow frame must not make the next one slower. */
const MAX_STEPS = 2;
/** Effective gravity under water for stone (buoyancy), and the drag there. */
const WET_GRAVITY = 0.6;

let loading: Promise<RapierModule | null> | null = null;

/** Load (once) and initialise Rapier; null if it cannot run here. */
export function loadRapier(): Promise<RapierModule | null> {
  loading ??= import('@dimforge/rapier3d-compat')
    .then(async (mod) => {
      // The package's default export is the namespace itself; some bundlers hand over only one of them.
      const R = (mod as unknown as { default?: RapierModule }).default ?? mod;
      await R.init();
      warm(R);
      return R;
    })
    .catch((err: unknown) => {
      log.once('bridge:rapier', 'bridge', 'Rapier could not load; the collapse uses simple physics', err);
      return null;
    });
  return loading;
}

/** A few steps of a small pile, so the engine's code is compiled before the first real fall. */
function warm(R: RapierModule): void {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(R.ColliderDesc.cuboid(20, 0.5, 20).setTranslation(0, -0.5, 0));
  for (let i = 0; i < 64; i++) {
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation((i % 8) * 0.7, 0.3 + Math.floor(i / 8) * 0.45, 0));
    world.createCollider(R.ColliderDesc.cuboid(0.3, 0.2, 0.5), body);
  }
  for (let k = 0; k < 30; k++) world.step();
  world.free();
}

/** An oriented box in a body's frame. */
export interface Box {
  readonly center: Vector3;
  readonly half: Vector3;
  readonly rot: Quaternion;
}

export interface BodySpec {
  readonly id: number;
  readonly pos: Vector3;
  readonly rot: Quaternion;
  readonly vel: Vector3;
  readonly spin: Vector3;
  readonly box: Box;
  /** Tonnes. */
  readonly mass: number;
}

export interface DebrisSim {
  add(b: BodySpec): void;
  /** A stone that stays standing but that falling ones can land on. */
  addFixed(box: Box, pos: Vector3): void;
  step(dt: number, water: number, current: number): void;
  read(id: number, pos: Vector3, rot: Quaternion, vel: Vector3): void;
  sleeping(id: number): boolean;
  remove(id: number): void;
  dispose(): void;
}

/** Minimum-area rectangle of an elevation outline, as a box about the stone's pivot. */
export function stoneBox(s: StoneSpec, aabb: Float32Array, i: number): Box {
  const rot = new Quaternion();
  if (s.shape.plane === 'xy' && !s.shape.top) {
    const pts = s.shape.poly;
    let best = { area: Infinity, a: 0, u0: 0, u1: 0, v0: 0, v1: 0 };
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k]!;
      const q = pts[(k + 1) % pts.length]!;
      const a = Math.atan2(q.y - p.y, q.x - p.x);
      const c = Math.cos(a);
      const sn = Math.sin(a);
      let u0 = Infinity;
      let u1 = -Infinity;
      let v0 = Infinity;
      let v1 = -Infinity;
      for (const r of pts) {
        const u = r.x * c + r.y * sn;
        const v = -r.x * sn + r.y * c;
        u0 = Math.min(u0, u);
        u1 = Math.max(u1, u);
        v0 = Math.min(v0, v);
        v1 = Math.max(v1, v);
      }
      const area = (u1 - u0) * (v1 - v0);
      if (area < best.area) best = { area, a, u0, u1, v0, v1 };
    }
    const c = Math.cos(best.a);
    const sn = Math.sin(best.a);
    const um = (best.u0 + best.u1) / 2;
    const vm = (best.v0 + best.v1) / 2;
    rot.setFromAxisAngle(new Vector3(0, 0, 1), best.a);
    return {
      center: new Vector3(um * c - vm * sn - s.pivot.x, um * sn + vm * c - s.pivot.y, (s.shape.w0 + s.shape.w1) / 2 - s.pivot.z),
      half: new Vector3(Math.max(0.03, (best.u1 - best.u0) / 2 - 0.004), Math.max(0.03, (best.v1 - best.v0) / 2 - 0.004), Math.max(0.03, (s.shape.w1 - s.shape.w0) / 2 - 0.004)),
      rot,
    };
  }
  const k = i * 6;
  return {
    center: new Vector3((aabb[k]! + aabb[k + 3]!) / 2 - s.pivot.x, (aabb[k + 1]! + aabb[k + 4]!) / 2 - s.pivot.y, (aabb[k + 2]! + aabb[k + 5]!) / 2 - s.pivot.z),
    half: new Vector3(Math.max(0.03, (aabb[k + 3]! - aabb[k]!) / 2 - 0.004), Math.max(0.03, (aabb[k + 4]! - aabb[k + 1]!) / 2 - 0.004), Math.max(0.03, (aabb[k + 5]! - aabb[k + 2]!) / 2 - 0.004)),
    rot,
  };
}

class RapierSim implements DebrisSim {
  private readonly world: RWorld;
  private readonly bodies = new Map<number, RBody>();
  private acc = 0;

  constructor(
    private readonly R: RapierModule,
    ground: Profile,
    x0: number,
    x1: number,
  ) {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = STEP;
    // The valley floor as a strip of triangles across the river.
    const xs: number[] = [];
    for (let x = x0; x <= x1; x += 0.5) xs.push(x);
    const verts = new Float32Array(xs.length * 2 * 3);
    xs.forEach((x, k) => {
      const y = ground.at(x);
      verts.set([x, y, -40, x, y, 40], k * 6);
    });
    const idx: number[] = [];
    for (let k = 0; k < xs.length - 1; k++) {
      const a = k * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const floor = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    this.world.createCollider(R.ColliderDesc.trimesh(verts, new Uint32Array(idx)).setFriction(0.8), floor);
  }

  add(b: BodySpec): void {
    const R = this.R;
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(b.pos.x, b.pos.y, b.pos.z)
      .setRotation({ x: b.rot.x, y: b.rot.y, z: b.rot.z, w: b.rot.w })
      .setLinvel(b.vel.x, b.vel.y, b.vel.z)
      .setAngvel({ x: b.spin.x, y: b.spin.y, z: b.spin.z })
      .setLinearDamping(0.05)
      .setAngularDamping(0.2)
      .setCcdEnabled(b.mass > 0.4);
    const body = this.world.createRigidBody(desc);
    const vol = 8 * b.box.half.x * b.box.half.y * b.box.half.z;
    const col = R.ColliderDesc.cuboid(b.box.half.x, b.box.half.y, b.box.half.z)
      .setTranslation(b.box.center.x, b.box.center.y, b.box.center.z)
      .setRotation({ x: b.box.rot.x, y: b.box.rot.y, z: b.box.rot.z, w: b.box.rot.w })
      .setDensity(b.mass / Math.max(1e-3, vol))
      .setFriction(0.7)
      .setRestitution(0.05);
    this.world.createCollider(col, body);
    this.bodies.set(b.id, body);
  }

  addFixed(box: Box, pos: Vector3): void {
    const R = this.R;
    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z));
    const col = R.ColliderDesc.cuboid(box.half.x, box.half.y, box.half.z)
      .setTranslation(box.center.x, box.center.y, box.center.z)
      .setRotation({ x: box.rot.x, y: box.rot.y, z: box.rot.z, w: box.rot.w })
      .setFriction(0.7);
    this.world.createCollider(col, body);
  }

  step(dt: number, water: number, current: number): void {
    for (const body of this.bodies.values()) {
      const wet = body.translation().y < water;
      body.setGravityScale(wet ? WET_GRAVITY : 1, false);
      body.setLinearDamping(wet ? 1.6 : 0.05);
      body.setAngularDamping(wet ? 1.2 : 0.2);
      if (wet && current > 0) {
        const v = body.linvel();
        body.setLinvel({ x: v.x, y: v.y, z: v.z + (-current - v.z) * Math.min(1, dt * 0.6) }, false);
      }
    }
    this.acc = Math.min(this.acc + dt, STEP * MAX_STEPS);
    while (this.acc >= STEP) {
      this.world.step();
      this.acc -= STEP;
    }
  }

  read(id: number, pos: Vector3, rot: Quaternion, vel: Vector3): void {
    const b = this.bodies.get(id);
    if (!b) return;
    const t = b.translation();
    const r = b.rotation();
    const v = b.linvel();
    pos.set(t.x, t.y, t.z);
    rot.set(r.x, r.y, r.z, r.w);
    vel.set(v.x, v.y, v.z);
  }

  sleeping(id: number): boolean {
    return this.bodies.get(id)?.isSleeping() ?? true;
  }

  remove(id: number): void {
    const b = this.bodies.get(id);
    if (!b) return;
    this.world.removeRigidBody(b);
    this.bodies.delete(id);
  }

  dispose(): void {
    this.bodies.clear();
    this.world.free();
  }
}

interface Point {
  pos: Vector3;
  rot: Quaternion;
  vel: Vector3;
  spin: Vector3;
  radius: number;
  still: number;
}

/** The fallback: free bodies over the ground line, no stone-on-stone contact. */
class SimpleSim implements DebrisSim {
  private readonly points = new Map<number, Point>();
  private readonly dq = new Quaternion();
  private readonly axis = new Vector3();

  constructor(private readonly ground: Profile) {}

  add(b: BodySpec): void {
    this.points.set(b.id, { pos: b.pos.clone(), rot: b.rot.clone(), vel: b.vel.clone(), spin: b.spin.clone(), radius: Math.min(b.box.half.x, b.box.half.y, b.box.half.z), still: 0 });
  }

  addFixed(): void {}

  step(dt: number, water: number, current: number): void {
    const h = Math.min(dt, 1 / 30);
    for (const p of this.points.values()) {
      const wet = p.pos.y < water;
      p.vel.y -= 9.81 * (wet ? WET_GRAVITY : 1) * h;
      if (wet) {
        p.vel.multiplyScalar(Math.max(0, 1 - 1.6 * h));
        p.spin.multiplyScalar(Math.max(0, 1 - 1.2 * h));
        p.vel.z += (-current - p.vel.z) * Math.min(1, h * 0.6);
      }
      p.pos.addScaledVector(p.vel, h);
      const floor = this.ground.at(p.pos.x) + p.radius;
      if (p.pos.y < floor) {
        p.pos.y = floor;
        if (p.vel.y < 0) p.vel.y *= -0.15;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
        p.spin.multiplyScalar(0.6);
      }
      const w = p.spin.length();
      if (w > 1e-6) {
        this.dq.setFromAxisAngle(this.axis.copy(p.spin).divideScalar(w), w * h);
        p.rot.premultiply(this.dq);
      }
      p.still = p.vel.lengthSq() < 0.01 ? p.still + h : 0;
    }
  }

  read(id: number, pos: Vector3, rot: Quaternion, vel: Vector3): void {
    const p = this.points.get(id);
    if (!p) return;
    pos.copy(p.pos);
    rot.copy(p.rot);
    vel.copy(p.vel);
  }

  sleeping(id: number): boolean {
    return (this.points.get(id)?.still ?? 1) > 0.5;
  }

  remove(id: number): void {
    this.points.delete(id);
  }

  dispose(): void {
    this.points.clear();
  }
}

/** Free bodies without contact between them: for the small stones beyond the rigid-body budget. */
export function simpleDebris(ground: Profile): DebrisSim {
  return new SimpleSim(ground);
}

/** A debris simulation: Rapier when it is available, the simple one otherwise. */
export async function createDebris(ground: Profile, x0: number, x1: number): Promise<DebrisSim> {
  const R = await loadRapier();
  if (R) {
    try {
      return new RapierSim(R, ground, x0, x1);
    } catch (err) {
      log.once('bridge:rapier-world', 'bridge', 'Rapier world failed; simple physics instead', err);
    }
  }
  return new SimpleSim(ground);
}
