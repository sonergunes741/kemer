/**
 * Camera direction (DESIGN 6): a true side view with a long lens for design, three-quarter views
 * for building, low by the water for the strike, wide with much sky for the centuries, a closer
 * look when something happens. The player may look around by dragging; the view drifts back.
 * Reduced motion keeps the glides but drops the push-ins.
 */
import type { CameraPose, WorldApi } from '../core/contracts';
import type { BridgeGeometry, Vec3 } from '../core/types';
import { mainSpan } from './design/handles';

const LOOK_IDLE = 2.2;
/** The time view: share of the picture's width the bridge spans, and the height of its middle (-1 bottom, 1 top). */
const TIME_WIDTH = 0.6;
const TIME_LEVEL = -0.2;
/** Samples along a line of sight: a bank a couple of metres across still shows at a few hundred metres. */
const SIGHT_SAMPLES = 96;
/** The last stretch of a sight line runs over the bridge's own banks; they do not count. */
const SIGHT_REACH = 0.94;

export class CameraDirector {
  private idle = 0;
  private looking = false;

  constructor(
    private readonly world: WorldApi,
    private readonly reduced: () => boolean,
  ) {}

  private get rig() {
    return this.world.rig;
  }

  set(pose: CameraPose): void {
    this.rig.set(pose);
  }

  to(pose: CameraPose, seconds: number, ease: 'in-out' | 'out' | 'linear' = 'in-out'): Promise<void> {
    return this.rig.move(pose, seconds, ease);
  }

  /** A short push towards the target (the keystone seating, an event): skipped with reduced motion. */
  push(amount: number, seconds: number): void {
    if (this.reduced()) return;
    const p = this.rig.pose;
    void this.rig.move({ ...p, target: { ...p.target }, distance: p.distance * (1 - amount) }, seconds, 'out');
  }

  shake(amount: number): void {
    if (!this.reduced()) this.rig.shake(amount);
  }

  look(dYaw: number, dPitch: number, dZoom: number): void {
    this.rig.nudge(dYaw, dPitch, dZoom);
    this.idle = 0;
    this.looking = true;
  }

  /** Let the view drift back now (a phase change). */
  recentre(): void {
    this.rig.recentre();
    this.looking = false;
  }

  update(dt: number): void {
    if (!this.looking) return;
    this.idle += dt;
    if (this.idle > LOOK_IDLE) this.recentre();
  }

  /* -- poses ------------------------------------------------------------------------------ */

  private frame(g: BridgeGeometry, yaw: number, pitch: number, fov: number, margin: number): CameraPose {
    return this.rig.frame(g, yaw, pitch, fov, margin);
  }

  /** Close views frame the arches, not the long approach ramps the deck line runs out along. */
  private work(g: BridgeGeometry, yaw: number, pitch: number, fov: number, margin: number): CameraPose {
    const a = g.abutments[0].spring.x;
    const b = g.abutments[1].spring.x;
    const pad = Math.max(1.2, (b - a) * 0.12);
    const deck = g.deck.filter((p) => p.x >= a - pad && p.x <= b + pad);
    return this.rig.frame(deck.length >= 2 ? { ...g, deck } : g, yaw, pitch, fov, margin);
  }

  /** Arriving: high upstream, the valley below. */
  arrival(g: BridgeGeometry): CameraPose {
    const p = this.frame(g, 0.12, 0.5, 40, 2.4);
    return { ...p, distance: p.distance * 1.6 };
  }

  /** The working view the arrival glides into. */
  working(g: BridgeGeometry): CameraPose {
    return this.frame(g, 0.38, 0.13, 38, 0.9);
  }

  /** The title's quiet backdrop. */
  title(g: BridgeGeometry): CameraPose {
    return this.frame(g, 0.62, 0.09, 42, 1.5);
  }

  /**
   * The first pose from which the ground hides none of the arch openings. Down the valley the river
   * bends, so a low eye far upstream can stand behind a bank; failing all, the last pose. With
   * `springings` the feet of every ring must show too (the design view: the whole ring is the
   * subject).
   */
  private clearest(g: BridgeGeometry, poses: readonly CameraPose[], springings = false): CameraPose {
    const z = g.width / 2;
    const marks: Vec3[] = [];
    for (const sp of g.spans) {
      const rise = sp.crown.y - sp.left.y;
      marks.push({ x: sp.crown.x, y: sp.crown.y, z });
      marks.push({ x: sp.left.x + sp.span * 0.2, y: sp.left.y + rise * 0.4, z });
      marks.push({ x: sp.right.x - sp.span * 0.2, y: sp.right.y + rise * 0.4, z });
      if (springings) {
        // Just inside the opening and a hand above where the ring leaves the ground: a springing
        // set down into the bank shows from where the stone comes out of it.
        const inset = Math.min(0.2, sp.span * 0.03);
        const foot = (x: number, y: number): Vec3 => ({ x, y: Math.max(y, this.world.groundAt(x, z)) + 0.15, z });
        marks.push(foot(sp.left.x + inset, sp.left.y));
        marks.push(foot(sp.right.x - inset, sp.right.y));
      }
    }
    for (const pose of poses) if (this.sees(pose, marks)) return pose;
    return poses[poses.length - 1]!;
  }

  private sees(pose: CameraPose, marks: readonly Vec3[]): boolean {
    const ground = (x: number, z: number): number => this.world.groundAt(x, z);
    const cp = Math.cos(pose.pitch);
    const ex = pose.target.x + Math.sin(pose.yaw) * cp * pose.distance;
    const ey = pose.target.y + Math.sin(pose.pitch) * pose.distance;
    const ez = pose.target.z + Math.cos(pose.yaw) * cp * pose.distance;
    // The rig lifts an eye out of the ground, which then looks down over the bank.
    if (ground(ex, ez) + 0.3 > ey) return false;
    for (const m of marks) {
      // The last stretch runs over the bridge's own footing; stop half a metre short of the face.
      const length = Math.hypot(m.x - ex, m.y - ey, m.z - ez);
      const reach = Math.max(SIGHT_REACH, 1 - 0.5 / Math.max(length, 1));
      for (let i = 1; i < SIGHT_SAMPLES * reach; i++) {
        const k = i / SIGHT_SAMPLES;
        if (ground(ex + (m.x - ex) * k, ez + (m.z - ez) * k) > ey + (m.y - ey) * k) return false;
      }
    }
    return true;
  }

  /**
   * Design: a true elevation, flat, through a long lens, with room for the banks and the handles.
   * Where the near banks would hide a springing the eye climbs, and the lens shortens, step by
   * step until both feet of every ring are in sight.
   */
  design(g: BridgeGeometry): CameraPose {
    const steps: readonly [number, number, number][] = [
      [0, 0.015, 15],
      [0, 0.04, 16],
      [0, 0.07, 18],
      [0, 0.1, 20],
      [0, 0.13, 23],
      [0.1, 0.13, 23],
      [-0.1, 0.13, 23],
      [0, 0.17, 26],
      [0, 0.22, 30],
      [0, 0.28, 34],
      [0, 0.36, 38],
    ];
    return this.clearest(
      g,
      steps.map(([yaw, pitch, fov]) => this.frame(g, yaw, pitch, fov, 0.62)),
      true,
    );
  }

  build(g: BridgeGeometry): CameraPose {
    // The stones go down from the springings: those must show, not only the opening.
    return this.clearest(
      g,
      [this.work(g, 0.58, 0.16, 34, 0.32), this.work(g, 0.58, 0.26, 34, 0.32), this.work(g, -0.58, 0.18, 34, 0.32), this.work(g, 0.42, 0.34, 34, 0.32)],
      true,
    );
  }

  /** The keystone over its gap, the ring below it and the hoist above, from a little to the side. */
  keystone(g: BridgeGeometry, seat: Vec3): CameraPose {
    const sp = g.spans[mainSpan(g)];
    const span = sp?.span ?? 8;
    return { target: { x: seat.x, y: seat.y - span * 0.12, z: 0 }, distance: Math.max(11, span * 1.9 + 5), yaw: 0.3, pitch: 0.07, fov: 32 };
  }

  mark(g: BridgeGeometry): CameraPose {
    return this.work(g, 0.24, 0.07, 30, 0.2);
  }

  /** Low by the water, looking up at the ring. */
  strike(g: BridgeGeometry): CameraPose {
    const sp = g.spans[mainSpan(g)];
    const span = sp?.span ?? 8;
    const crown = sp?.crown ?? { x: 0, y: 3 };
    const spring = sp?.left.y ?? 0;
    return { target: { x: crown.x, y: spring + (crown.y - spring) * 0.72, z: 0 }, distance: span * 0.95 + 5, yaw: 0.58, pitch: -0.1, fov: 46 };
  }

  /**
   * The centuries: wide, with a great deal of sky, and the bridge the clear subject: whatever the
   * river, it spans about three fifths of the picture's width and sits a little below the middle.
   */
  time(g: BridgeGeometry): CameraPose {
    const aspect = this.rig.camera.aspect;
    const compose = (p: CameraPose): CameraPose => composeTime(g, p, aspect);
    // Whole rings, feet included: a bank in front of a springing makes the bridge look sunk.
    return this.clearest(
      g,
      [
        compose(this.frame(g, 0.44, 0.06, 46, 1.1)),
        compose(this.frame(g, -0.44, 0.06, 46, 1.1)),
        compose(this.frame(g, 0.4, 0.14, 46, 1.1)),
        compose(this.frame(g, -0.4, 0.14, 46, 1.1)),
        compose(this.frame(g, 0.3, 0.24, 46, 1.1)),
      ],
      true,
    );
  }

  /** Closer, for a flood or a quake: the water at the springings must be in sight. */
  event(g: BridgeGeometry): CameraPose {
    return this.clearest(g, [this.work(g, 0.52, 0.13, 40, 0.45), this.work(g, -0.52, 0.13, 40, 0.45), this.work(g, 0.52, 0.24, 40, 0.45)], true);
  }

  fall(g: BridgeGeometry): CameraPose {
    return this.clearest(g, [this.work(g, 0.46, 0.11, 40, 0.65), this.work(g, -0.46, 0.11, 40, 0.65), this.work(g, 0.46, 0.22, 40, 0.65)], true);
  }
}

/** Where a point lands in the picture of a pose, in normalised device units; null behind the eye. */
export function projectPose(pose: CameraPose, aspect: number, p: Vec3): { x: number; y: number } | null {
  const cp = Math.cos(pose.pitch);
  const bx = Math.sin(pose.yaw) * cp;
  const by = Math.sin(pose.pitch);
  const bz = Math.cos(pose.yaw) * cp;
  const dx = p.x - (pose.target.x + bx * pose.distance);
  const dy = p.y - (pose.target.y + by * pose.distance);
  const dz = p.z - (pose.target.z + bz * pose.distance);
  const depth = -(dx * bx + dy * by + dz * bz);
  if (depth < 1e-3) return null;
  // right = forward x world up; up = right x forward (as the rig's camera.lookAt builds them).
  const rl = Math.hypot(bz, bx) || 1;
  const rx = bz / rl;
  const rz = -bx / rl;
  const ux = rz * by;
  const uy = rx * bz - rz * bx;
  const uz = -rx * by;
  const tanV = Math.tan((pose.fov * Math.PI) / 360);
  return { x: (dx * rx + dz * rz) / (depth * tanV * aspect), y: (dx * ux + dy * uy + dz * uz) / (depth * tanV) };
}

/**
 * Compose the time view from a framed pose: dolly until the bridge spans TIME_WIDTH of the
 * picture, centre it across, and lift the aim until its middle sits at TIME_LEVEL, so the sky
 * fills the top of the frame on a village footbridge and on a long causeway alike.
 */
export function composeTime(g: BridgeGeometry, start: CameraPose, aspect: number): CameraPose {
  const hw = g.width / 2;
  const pts: Vec3[] = [];
  let low = 0;
  for (const s of g.spans) low = Math.min(low, s.left.y, s.right.y);
  for (const d of g.deck) {
    for (const z of [-hw, hw]) {
      pts.push({ x: d.x, y: d.y + g.parapetHeight, z });
      pts.push({ x: d.x, y: Math.min(low, d.y), z });
    }
  }
  if (pts.length === 0) return start;
  const p: CameraPose = { ...start, target: { ...start.target } };
  for (let iter = 0; iter < 6; iter++) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const q of pts) {
      const s = projectPose(p, aspect, q);
      if (!s) continue;
      x0 = Math.min(x0, s.x);
      x1 = Math.max(x1, s.x);
      y0 = Math.min(y0, s.y);
      y1 = Math.max(y1, s.y);
    }
    if (!Number.isFinite(x0) || x1 - x0 < 1e-4) break;
    const tanV = Math.tan((p.fov * Math.PI) / 360);
    const cp = Math.cos(p.pitch);
    // Re-aim first (at this distance), then dolly: the share scales about inversely with distance.
    const sx = ((x0 + x1) / 2) * p.distance * tanV * aspect;
    const sy = ((y0 + y1) / 2 - TIME_LEVEL) * p.distance * tanV;
    p.target.x += Math.cos(p.yaw) * sx;
    p.target.z -= Math.sin(p.yaw) * sx;
    p.target.y += sy * cp;
    p.distance = Math.max(4, p.distance * ((x1 - x0) / 2 / TIME_WIDTH));
  }
  return p;
}
