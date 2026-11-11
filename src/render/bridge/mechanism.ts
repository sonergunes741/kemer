/**
 * The first half second of a fall: the ring turns about its hinges as a mechanism, before the
 * stones are handed to the physics. Pure 2D kinematics in the elevation plane.
 *
 * Four hinges make a four-bar linkage (the ring between the outer hinges is the ground link). With
 * three the arch can only move if a support gives way, so the last hinge slides outward along its
 * bed. With one or two the part beyond the first hinge simply overturns about it.
 */
import type { Vec2 } from '../../core/types';

/** A rigid motion of the plane: rotate by `angle` about `about`, then translate by `move`. */
export interface Xf2 {
  readonly about: Vec2;
  readonly angle: number;
  readonly move: Vec2;
}

export function applyXf(t: Xf2, p: Vec2): Vec2 {
  const c = Math.cos(t.angle);
  const s = Math.sin(t.angle);
  const x = p.x - t.about.x;
  const y = p.y - t.about.y;
  return { x: t.about.x + x * c - y * s + t.move.x, y: t.about.y + x * s + y * c + t.move.y };
}

const rotAbout = (about: Vec2, angle: number): Xf2 => ({ about, angle, move: { x: 0, y: 0 } });

/** The motion taking segment a-b to a'-b' (lengths equal). */
function rigid(a: Vec2, b: Vec2, a2: Vec2, b2: Vec2): Xf2 {
  const angle = Math.atan2(b2.y - a2.y, b2.x - a2.x) - Math.atan2(b.y - a.y, b.x - a.x);
  return { about: a, angle, move: { x: a2.x - a.x, y: a2.y - a.y } };
}

function circles(c0: Vec2, r0: number, c1: Vec2, r1: number, near: Vec2): Vec2 | null {
  const dx = c1.x - c0.x;
  const dy = c1.y - c0.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9 || d > r0 + r1 || d < Math.abs(r0 - r1)) return null;
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r0 * r0 - a * a));
  const mx = c0.x + (a * dx) / d;
  const my = c0.y + (a * dy) / d;
  const p = { x: mx - (h * dy) / d, y: my + (h * dx) / d };
  const q = { x: mx + (h * dy) / d, y: my - (h * dx) / d };
  return Math.hypot(p.x - near.x, p.y - near.y) <= Math.hypot(q.x - near.x, q.y - near.y) ? p : q;
}

/**
 * Motion of each segment between consecutive hinges after the first segment has turned by
 * `theta` (radians, >= 0) in the given sense (+1 clockwise). Returns null once the linkage locks
 * (the caller keeps the last valid pose).
 */
export function mechanism(h: readonly Vec2[], sense: 1 | -1, theta: number): Xf2[] | null {
  const a1 = -sense * theta;
  if (h.length < 3) return h.length === 2 ? [rotAbout(h[0]!, a1)] : [];
  const first = rotAbout(h[0]!, a1);
  const h1 = applyXf(first, h[1]!);
  if (h.length === 3) {
    // Three hinges: the last one slides along its bed (the support spreads or closes).
    const len = Math.hypot(h[2]!.x - h[1]!.x, h[2]!.y - h[1]!.y);
    const dy = h[2]!.y - h1.y;
    if (Math.abs(dy) > len) return null;
    const h2 = { x: h1.x + Math.sign(h[2]!.x - h[1]!.x || 1) * Math.sqrt(len * len - dy * dy), y: h[2]!.y };
    return [first, rigid(h[1]!, h[2]!, h1, h2)];
  }
  // Four (or more: the extra ones are treated as fixed beyond the fourth).
  const coupler = Math.hypot(h[2]!.x - h[1]!.x, h[2]!.y - h[1]!.y);
  const rocker = Math.hypot(h[3]!.x - h[2]!.x, h[3]!.y - h[2]!.y);
  const h2 = circles(h1, coupler, h[3]!, rocker, h[2]!);
  if (!h2) return null;
  const third = rotAbout(h[3]!, Math.atan2(h2.y - h[3]!.y, h2.x - h[3]!.x) - Math.atan2(h[2]!.y - h[3]!.y, h[2]!.x - h[3]!.x));
  return [first, rigid(h[1]!, h[2]!, h1, h2), third];
}
