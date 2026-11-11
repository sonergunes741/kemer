/**
 * Reading the line of thrust against the stone: for each point, where it sits across the ring
 * (0 on the intrados, 1 on the extrados), and from that whether it is comfortably inside, near an
 * edge (amber) or outside the stone (rust, dashed). Pure: used by the overlay and the collapse
 * drawing, and unit-tested.
 */
import type { SpanModel } from '../core/contracts';
import type { Vec2 } from '../core/types';

export const OK = 0;
export const NEAR = 1;
export const OUT = 2;
export type ThrustClass = typeof OK | typeof NEAR | typeof OUT;

/** Within 15 % of the ring's depth from either face counts as near the edge. */
export const NEAR_FRACTION = 0.15;
/** A whisker of tolerance so a line exactly on the face is not called outside. */
const OUT_TOLERANCE = 0.005;

/** Where p lies along the joint from its intrados end a to its extrados end b (projected). */
export function acrossJoint(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return 0.5;
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
}

export function classOf(across: number, near = NEAR_FRACTION): ThrustClass {
  if (across < -OUT_TOLERANCE || across > 1 + OUT_TOLERANCE) return OUT;
  if (across < near || across > 1 - near) return NEAR;
  return OK;
}

/**
 * One class per thrust point. The game gives one thrust point per joint; if the counts differ,
 * each point is read against the joint whose midpoint is nearest.
 */
export function classifyThrust(span: Pick<SpanModel, 'thrustLine' | 'joints'>, near = NEAR_FRACTION): ThrustClass[] {
  const { thrustLine, joints } = span;
  const out: ThrustClass[] = [];
  if (joints.length === 0) return thrustLine.map(() => OK);
  const matched = joints.length === thrustLine.length;
  for (let i = 0; i < thrustLine.length; i++) {
    const p = thrustLine[i]!;
    const joint = matched ? joints[i]! : nearestJoint(p, joints);
    out.push(classOf(acrossJoint(p, joint[0], joint[1]), near));
  }
  return out;
}

function nearestJoint(p: Vec2, joints: readonly (readonly [Vec2, Vec2])[]): readonly [Vec2, Vec2] {
  let best = joints[0]!;
  let bestD = Infinity;
  for (const j of joints) {
    const mx = (j[0].x + j[1].x) / 2 - p.x;
    const my = (j[0].y + j[1].y) / 2 - p.y;
    const d = mx * mx + my * my;
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  }
  return best;
}

export interface ThrustRun {
  readonly cls: ThrustClass;
  /** Indices into the thrust line, inclusive, consecutive runs share their boundary point. */
  readonly from: number;
  readonly to: number;
}

/**
 * Split the line into runs of one class. A segment takes the worse class of its two ends, so
 * the colour turns before the line reaches the edge, not after.
 */
export function thrustRuns(classes: readonly ThrustClass[]): ThrustRun[] {
  const runs: ThrustRun[] = [];
  for (let i = 0; i + 1 < classes.length; i++) {
    const cls = Math.max(classes[i]!, classes[i + 1]!) as ThrustClass;
    const last = runs[runs.length - 1];
    if (last && last.cls === cls && last.to === i) runs[runs.length - 1] = { cls, from: last.from, to: i + 1 };
    else runs.push({ cls, from: i, to: i + 1 });
  }
  return runs;
}

/** Index of the crown: the highest point of the line (the shimmer flows away from it). */
export function crownIndex(line: readonly Vec2[]): number {
  let best = 0;
  for (let i = 1; i < line.length; i++) if (line[i]!.y > line[best]!.y) best = i;
  return best;
}

/** The worst class of a run of points near a position (for colouring a hinge circle). */
export function classNear(line: readonly Vec2[], classes: readonly ThrustClass[], at: Vec2): ThrustClass {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < line.length; i++) {
    const d = (line[i]!.x - at.x) ** 2 + (line[i]!.y - at.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return classes[best] ?? OK;
}
