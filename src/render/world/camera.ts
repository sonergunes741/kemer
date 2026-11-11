/**
 * The camera rig: a directed pose (target, distance, yaw, pitch, fov) that the game sets or
 * glides between, the player's small look-around offsets on top, and trauma-based shake.
 * Also the projection between the elevation plane and CSS pixels for the interface.
 */
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { CameraPose, CameraRig } from '../../core/contracts';
import type { BridgeGeometry, Vec2, Vec3 } from '../../core/types';
import { clamp, damp, easeInOutCubic, easeOutCubic, lerp, wrapAngle } from '../../core/math';

const LIMIT_YAW = 0.45;
const LIMIT_PITCH = 0.28;
const LIMIT_ZOOM = 0.55;

function copyPose(p: CameraPose): CameraPose {
  return { target: { x: p.target.x, y: p.target.y, z: p.target.z }, distance: p.distance, yaw: p.yaw, pitch: p.pitch, fov: p.fov };
}

/** Unit vector from the target towards the camera for a yaw and pitch. */
export function orbitDirection(yaw: number, pitch: number, out = new Vector3()): Vector3 {
  const cp = Math.cos(pitch);
  return out.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
}

/**
 * A pose that frames the bridge: every corner of its box fits in the view with `margin` to
 * spare. Pure (needs only the aspect), so it is testable.
 */
export function framePose(geometry: BridgeGeometry, yaw: number, pitch: number, fov: number, aspect: number, margin = 0.12): CameraPose {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  const take = (p: Vec2): void => {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  };
  for (const p of geometry.deck) take({ x: p.x, y: p.y + geometry.parapetHeight });
  for (const s of geometry.spans) {
    take(s.left);
    take(s.right);
    take(s.crown);
  }
  for (const pr of geometry.piers) take({ x: pr.x, y: pr.top });
  if (!Number.isFinite(x0)) {
    x0 = -5;
    x1 = 5;
    y0 = 0;
    y1 = 4;
  }
  // Keep a little water in the picture below the springings.
  y0 = Math.min(y0, 0) - 0.5;
  const hw = geometry.width / 2;
  const c = new Vector3((x0 + x1) / 2, (y0 + y1) / 2, 0);
  const back = orbitDirection(yaw, pitch);
  const fwd = back.clone().negate();
  const right = new Vector3().crossVectors(fwd, new Vector3(0, 1, 0));
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  const up = new Vector3().crossVectors(right, fwd).normalize();
  const tanV = Math.tan(MathUtils.degToRad(fov) / 2) / (1 + margin);
  const tanH = tanV * aspect;
  let distance = 0;
  const d = new Vector3();
  for (const x of [x0, x1])
    for (const y of [y0, y1])
      for (const z of [-hw, hw]) {
        d.set(x, y, z).sub(c);
        const depth = d.dot(fwd);
        distance = Math.max(distance, depth + Math.abs(d.dot(right)) / tanH, depth + Math.abs(d.dot(up)) / tanV);
      }
  return { target: { x: c.x, y: c.y, z: c.z }, distance: Math.max(distance, 1), yaw, pitch, fov };
}

export class Rig implements CameraRig {
  readonly camera = new PerspectiveCamera(35, 16 / 9, 0.1, 12000);
  private directed: CameraPose = { target: { x: 0, y: 2, z: 0 }, distance: 40, yaw: 0, pitch: 0.12, fov: 35 };
  private from: CameraPose | null = null;
  private to: CameraPose | null = null;
  private t = 0;
  private duration = 1;
  private ease: 'in-out' | 'out' | 'linear' = 'in-out';
  private resolve: (() => void) | null = null;
  private offYaw = 0;
  private offPitch = 0;
  private offZoom = 0;
  private recentring = false;
  private trauma = 0;
  private time = 0;
  reducedMotion = false;
  /** Ground and water height, so look-around never takes the camera underground. */
  floor: (x: number, z: number) => number = () => -Infinity;
  private readonly dir = new Vector3();
  private readonly look = new Vector3();

  get pose(): Readonly<CameraPose> {
    return this.directed;
  }

  /** The distance actually used this frame (directed distance times the zoom offset). */
  get viewDistance(): number {
    return this.directed.distance * Math.exp(this.offZoom);
  }

  set(pose: CameraPose): void {
    this.finishMove();
    this.directed = copyPose(pose);
    this.apply();
  }

  move(pose: CameraPose, seconds: number, ease: 'in-out' | 'out' | 'linear' = 'in-out'): Promise<void> {
    this.finishMove();
    if (seconds <= 0) {
      this.set(pose);
      return Promise.resolve();
    }
    this.from = copyPose(this.directed);
    this.to = copyPose(pose);
    this.t = 0;
    this.duration = seconds;
    this.ease = ease;
    return new Promise((res) => {
      this.resolve = res;
    });
  }

  private finishMove(): void {
    const r = this.resolve;
    this.resolve = null;
    this.from = null;
    this.to = null;
    r?.();
  }

  nudge(dYaw: number, dPitch: number, dZoom: number): void {
    this.recentring = false;
    this.offYaw = clamp(this.offYaw + dYaw, -LIMIT_YAW, LIMIT_YAW);
    this.offPitch = clamp(this.offPitch + dPitch, -LIMIT_PITCH, LIMIT_PITCH);
    this.offZoom = clamp(this.offZoom + dZoom, -LIMIT_ZOOM, LIMIT_ZOOM);
  }

  recentre(): void {
    this.recentring = true;
  }

  shake(amount: number): void {
    if (this.reducedMotion) return;
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** Keep a minimum trauma while something lasts (an earthquake). */
  sustain(amount: number): void {
    if (this.reducedMotion) return;
    this.trauma = Math.max(this.trauma, clamp(amount, 0, 1));
  }

  frame(geometry: BridgeGeometry, yaw: number, pitch: number, fov: number, margin?: number): CameraPose {
    return framePose(geometry, yaw, pitch, fov, this.camera.aspect, margin);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.time += dt;
    if (this.from && this.to) {
      this.t += dt / this.duration;
      const k = this.t >= 1 ? 1 : this.ease === 'out' ? easeOutCubic(this.t) : this.ease === 'linear' ? this.t : easeInOutCubic(this.t);
      const a = this.from;
      const b = this.to;
      this.directed = {
        target: { x: lerp(a.target.x, b.target.x, k), y: lerp(a.target.y, b.target.y, k), z: lerp(a.target.z, b.target.z, k) },
        // Distance moves in log space so a long dolly feels even.
        distance: Math.exp(lerp(Math.log(a.distance), Math.log(b.distance), k)),
        yaw: a.yaw + wrapAngle(b.yaw - a.yaw) * k,
        pitch: lerp(a.pitch, b.pitch, k),
        fov: lerp(a.fov, b.fov, k),
      };
      if (this.t >= 1) {
        this.directed = copyPose(b);
        this.finishMove();
      }
    }
    if (this.recentring) {
      this.offYaw = damp(this.offYaw, 0, 2.2, dt);
      this.offPitch = damp(this.offPitch, 0, 2.2, dt);
      this.offZoom = damp(this.offZoom, 0, 2.2, dt);
      if (Math.abs(this.offYaw) + Math.abs(this.offPitch) + Math.abs(this.offZoom) < 1e-4) this.recentring = false;
    }
    this.trauma = Math.max(0, this.trauma - dt * 0.9);
    this.apply();
  }

  private apply(): void {
    const p = this.directed;
    const cam = this.camera;
    const yaw = p.yaw + this.offYaw;
    const pitch = clamp(p.pitch + this.offPitch, -0.35, 1.5);
    const dist = Math.max(0.5, p.distance * Math.exp(this.offZoom));
    orbitDirection(yaw, pitch, this.dir);
    this.look.set(p.target.x, p.target.y, p.target.z);
    cam.position.copy(this.look).addScaledVector(this.dir, dist);
    const floor = this.floor(cam.position.x, cam.position.z) + 0.3;
    if (cam.position.y < floor) cam.position.y = floor;
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    if (this.trauma > 0 && !this.reducedMotion) {
      const s = this.trauma * this.trauma;
      const t = this.time;
      cam.rotateY(s * 0.025 * (Math.sin(t * 37.1) * 0.6 + Math.sin(t * 23.7 + 1.3) * 0.4));
      cam.rotateX(s * 0.02 * (Math.sin(t * 41.3 + 0.7) * 0.6 + Math.sin(t * 19.1 + 2.1) * 0.4));
      cam.rotateZ(s * 0.012 * Math.sin(t * 29.3 + 0.4));
    }
    const fov = clamp(p.fov, 2, 100);
    // Near plane scales with the distance: depth precision for the far banks matters more than
    // anything closer than a hundredth of the way to the target.
    const near = clamp(dist * 0.01, 0.08, 10);
    if (cam.fov !== fov || cam.near !== near) {
      cam.fov = fov;
      cam.near = near;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }
}

const tmp = new Vector3();

/** World point to CSS pixels inside a canvas of the given CSS size. */
export function projectToCss(camera: PerspectiveCamera, p: Vec3, width: number, height: number, out: Vec2): Vec2 {
  tmp.set(p.x, p.y, p.z).project(camera);
  out.x = (tmp.x * 0.5 + 0.5) * width;
  out.y = (0.5 - tmp.y * 0.5) * height;
  return out;
}

/** CSS pixel to the plane Z = planeZ, as an elevation point; null if the ray misses it. */
export function unprojectToPlaneZ(camera: PerspectiveCamera, x: number, y: number, width: number, height: number, planeZ: number): Vec2 | null {
  if (width <= 0 || height <= 0) return null;
  const origin = new Vector3().setFromMatrixPosition(camera.matrixWorld);
  const dir = new Vector3((x / width) * 2 - 1, 1 - (y / height) * 2, 0.5).unproject(camera).sub(origin).normalize();
  if (Math.abs(dir.z) < 1e-6) return null;
  const t = (planeZ - origin.z) / dir.z;
  if (t <= 0) return null;
  return { x: origin.x + dir.x * t, y: origin.y + dir.y * t };
}
