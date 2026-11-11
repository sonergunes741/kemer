/**
 * Independent check of SIM-SPEC section 8: how far apart the supports of a ring can move before it
 * falls. Rigid-body kinematics and stability by virtual work only (./kinematic.ts); nothing from
 * movement.ts or the LP.
 *
 * As the right support moves out, three joints hinge and the ring follows as rigid bodies. The
 * spread ring is a new geometry whose three open joints touch at one point only. It falls when
 * that geometry has a mechanism its own weight drives, or when the two middle bodies can no longer
 * reach each other.
 */
import type { KinRing, Load, Pt, Side } from './kinematic';
import { pointLoad, standsUnderDeadLoad } from './kinematic';
import type { RingShape } from './kinematic-rings';
import { minimumThrust } from './kinematic-rings';

interface Hinges {
  readonly joints: readonly number[];
  readonly sides: readonly Side[];
}

interface Motion {
  /** Rotation angle, the point it turns about, and the translation applied afterwards. */
  readonly angle: number;
  readonly about: Pt;
  readonly shift: Pt;
}

function apply(m: Motion, p: Pt): Pt {
  const c = Math.cos(m.angle);
  const s = Math.sin(m.angle);
  const dx = p.x - m.about.x;
  const dy = p.y - m.about.y;
  return { x: m.about.x + c * dx - s * dy + m.shift.x, y: m.about.y + s * dx + c * dy + m.shift.y };
}

/**
 * The ring after its right support has moved out by u, hinging at `hinges`. Loads are the stones'
 * own weights at their moved centroids. Returns null when the bodies cannot span the gap.
 */
export function spreadRing(shape: RingShape, hinges: Hinges, u: number): KinRing | null {
  const n = shape.area.length;
  const [j1, j2, j3] = [hinges.joints[0]!, hinges.joints[1]!, hinges.joints[2]!];
  const point = (i: number): Pt => (hinges.sides[i] === 0 ? shape.a[hinges.joints[i]!]! : shape.b[hinges.joints[i]!]!);
  const h1 = point(0);
  const h2 = point(1);
  const h3 = point(2);
  const t3 = { x: h3.x + u, y: h3.y };
  const l1 = Math.hypot(h2.x - h1.x, h2.y - h1.y);
  const l2 = Math.hypot(h2.x - h3.x, h2.y - h3.y);
  const gap = Math.hypot(t3.x - h1.x, t3.y - h1.y);
  if (gap >= l1 + l2 || gap <= Math.abs(l1 - l2)) return null;
  // Triangle h1, middle hinge, t3 with known sides: the angle at h1 by the law of cosines. The
  // middle hinge stays on the side of the chord it was built on.
  const before = Math.atan2(h2.y - h1.y, h2.x - h1.x) - Math.atan2(h3.y - h1.y, h3.x - h1.x);
  const above = Math.sin(before) >= 0 ? 1 : -1;
  const atH1 = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + gap * gap - l2 * l2) / (2 * l1 * gap))));
  const chord = Math.atan2(t3.y - h1.y, t3.x - h1.x);
  const mid = { x: h1.x + l1 * Math.cos(chord + above * atH1), y: h1.y + l1 * Math.sin(chord + above * atH1) };
  const turn1 = Math.atan2(mid.y - h1.y, mid.x - h1.x) - Math.atan2(h2.y - h1.y, h2.x - h1.x);
  const turn2 = Math.atan2(mid.y - t3.y, mid.x - t3.x) - Math.atan2(h2.y - h3.y, h2.x - h3.x);
  const bodies: Motion[] = [
    { angle: 0, about: h1, shift: { x: 0, y: 0 } },
    { angle: turn1, about: h1, shift: { x: 0, y: 0 } },
    { angle: turn2, about: h3, shift: { x: u, y: 0 } },
    { angle: 0, about: h3, shift: { x: u, y: 0 } },
  ];
  const bodyOf = (k: number): Motion => bodies[k < j1 ? 0 : k < j2 ? 1 : k < j3 ? 2 : 3]!;
  const a: Pt[] = [];
  const b: Pt[] = [];
  for (let j = 0; j <= n; j++) {
    if (j === j1 || j === j2 || j === j3) {
      // An open joint touches at its hinge point only.
      const p = j === j1 ? h1 : j === j2 ? mid : t3;
      a.push(p);
      b.push(p);
    } else {
      // Any other joint lies inside one body: the stone on its left.
      const m = bodyOf(j - 1 < 0 ? 0 : j - 1);
      a.push(apply(m, shape.a[j]!));
      b.push(apply(m, shape.b[j]!));
    }
  }
  const dead: Load[] = [];
  const live: Load[] = [];
  for (let k = 0; k < n; k++) {
    const c = apply(bodyOf(k), shape.centroid[k]!);
    dead.push(pointLoad(c.x, c.y, 0, -shape.area[k]!));
    live.push({ fx: 0, fy: 0, mo: 0 });
  }
  return { a, b, dead, live };
}

/** Does the ring still stand with its right support moved out by u? */
export function standsSpread(shape: RingShape, u: number): boolean {
  const asBuilt: KinRing = { a: shape.a, b: shape.b, dead: shape.area.map((w, k) => pointLoad(shape.centroid[k]!.x, shape.centroid[k]!.y, 0, -w)), live: [] };
  let found = minimumThrust(asBuilt);
  let hinges: Hinges = { joints: found.joints, sides: found.sides };
  let ring: KinRing | null = null;
  // The hinges may wander as the ring opens: look for the set the spread ring itself would choose.
  for (let round = 0; round < 6; round++) {
    ring = spreadRing(shape, hinges, u);
    if (!ring) return false;
    found = minimumThrust(ring);
    if (found.joints.length < 3) return false;
    // A hinge that stays at an open joint keeps its side (both ends of that joint are one point now).
    const sides = found.joints.map((j, i) => {
      const was = hinges.joints.indexOf(j);
      return was >= 0 ? hinges.sides[was]! : found.sides[i]!;
    });
    const same = found.joints.every((j, i) => j === hinges.joints[i] && sides[i] === hinges.sides[i]);
    if (same) break;
    hinges = { joints: found.joints, sides };
  }
  // An open joint may turn either way, so the sides of its hinge are not bound to alternate.
  return ring !== null && standsUnderDeadLoad(ring, 1, true);
}

/** Largest outward movement of the right support the ring survives, by bisection up to `limit`. */
export function spreadLimit(shape: RingShape, limit: number, steps = 12): number {
  if (!standsSpread(shape, 0)) return 0;
  if (standsSpread(shape, limit)) return limit;
  let lo = 0;
  let hi = limit;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (standsSpread(shape, mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}
