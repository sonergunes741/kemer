/**
 * Companions of ./kinematic.ts: the minimum thrust of a ring by virtual work, and bare circular
 * rings built from first principles (not taken from arch.ts) for the textbook benchmarks.
 */
import type { KinRing, Load, Pt, Side } from './kinematic';
import { pointLoad, polygonCentroid, standsUnderDeadLoad } from './kinematic';

/**
 * Smallest horizontal thrust of the ring under its dead load, by virtual work: let the right
 * support slide outward at unit rate. Three hinges (two bodies) follow it, the dead load does work
 * W on them, and the thrust H that mechanism leaves on the support satisfies H * 1 = W. The
 * minimum thrust of the statics is the largest such W over the admissible mechanisms.
 */
export function minimumThrust(ring: KinRing): { thrust: number; joints: number[]; sides: Side[] } {
  const n = ring.dead.length;
  let best = -Infinity;
  let joints: number[] = [];
  let sides: Side[] = [];
  const fy = new Float64Array(n + 1);
  const fx = new Float64Array(n + 1);
  const mo = new Float64Array(n + 1);
  for (let k = 0; k < n; k++) {
    fx[k + 1] = fx[k]! + ring.dead[k]!.fx;
    fy[k + 1] = fy[k]! + ring.dead[k]!.fy;
    mo[k + 1] = mo[k]! + ring.dead[k]!.mo;
  }
  const end = (j: number, s: Side): Pt => (s === 0 ? ring.a[j]! : ring.b[j]!);
  for (let m = 0; m < 8; m++) {
    const s: Side[] = [(m & 1) as Side, ((m >> 1) & 1) as Side, ((m >> 2) & 1) as Side];
    for (let j1 = 0; j1 <= n - 2; j1++) {
      const h1 = end(j1, s[0]!);
      for (let j2 = j1 + 1; j2 <= n - 1; j2++) {
        const h2 = end(j2, s[1]!);
        for (let j3 = j2 + 1; j3 <= n; j3++) {
          const h3 = end(j3, s[2]!);
          // w1 k x (h2 - h1) + w2 k x (h3 - h2) = (1, 0).
          const ax = -(h2.y - h1.y);
          const ay = h2.x - h1.x;
          const bx = -(h3.y - h2.y);
          const by = h3.x - h2.x;
          const det = ax * by - ay * bx;
          if (Math.abs(det) < 1e-14) continue;
          const w1 = by / det;
          const w2 = -ay / det;
          // The joints may only open away from their hinge points (the third body does not turn).
          const r = [w1, w2 - w1, -w2];
          let ok = true;
          for (let i = 0; i < 3; i++) if ((s[i] === 1 ? r[i]! : -r[i]!) < -1e-12) ok = false;
          if (!ok) continue;
          // Body 1 turns about h1; body 2 has velocity w1 k x (h2 - h1) at h2 and turns at w2.
          const f1x = fx[j2]! - fx[j1]!;
          const f1y = fy[j2]! - fy[j1]!;
          const f2x = fx[j3]! - fx[j2]!;
          const f2y = fy[j3]! - fy[j2]!;
          const v2x = w1 * ax + w2 * h2.y;
          const v2y = w1 * ay - w2 * h2.x;
          // The stones beyond the third hinge ride on the support: only horizontal loads work there.
          const work =
            w1 * (f1x * h1.y - f1y * h1.x + (mo[j2]! - mo[j1]!)) + f2x * v2x + f2y * v2y + w2 * (mo[j3]! - mo[j2]!) + (fx[n]! - fx[j3]!);
          if (work > best) {
            best = work;
            joints = [j1, j2, j3];
            sides = s.slice();
          }
        }
      }
    }
  }
  return { thrust: best, joints, sides };
}

/* -- rings built here, not taken from the simulation ------------------------------------------- */

export interface RingShape {
  readonly a: Pt[];
  readonly b: Pt[];
  /** Elevation area and centroid of every course. */
  readonly area: number[];
  readonly centroid: Pt[];
}

/**
 * A circular ring of centre-line radius 1 and thickness `tOverR`, embracing `halfAngleDeg` each
 * side of the crown, cut by radial joints into `courses` equal voussoirs. The centre is the origin.
 * Areas and centroids come from finely subdivided polygons, not from the sector formula.
 */
export function circularRing(halfAngleDeg: number, tOverR: number, courses: number): RingShape {
  const half = (halfAngleDeg * Math.PI) / 180;
  const ri = 1 - tOverR / 2;
  const ro = 1 + tOverR / 2;
  // Angle from the crown, negative on the left.
  const at = (j: number): number => -half + (2 * half * j) / courses;
  const a: Pt[] = [];
  const b: Pt[] = [];
  for (let j = 0; j <= courses; j++) {
    const s = Math.sin(at(j));
    const c = Math.cos(at(j));
    a.push({ x: ri * s, y: ri * c });
    b.push({ x: ro * s, y: ro * c });
  }
  const area: number[] = [];
  const centroid: Pt[] = [];
  const cuts = 48;
  for (let k = 0; k < courses; k++) {
    const outline: Pt[] = [];
    for (let i = 0; i <= cuts; i++) {
      const t = at(k) + ((at(k + 1) - at(k)) * i) / cuts;
      outline.push({ x: ri * Math.sin(t), y: ri * Math.cos(t) });
    }
    for (let i = cuts; i >= 0; i--) {
      const t = at(k) + ((at(k + 1) - at(k)) * i) / cuts;
      outline.push({ x: ro * Math.sin(t), y: ro * Math.cos(t) });
    }
    const c = polygonCentroid(outline);
    area.push(Math.abs(c.area));
    centroid.push({ x: c.x, y: c.y });
  }
  return { a, b, area, centroid };
}

/**
 * The ring under its own weight (unit weight 1), with the weight applied horizontally as the live
 * load: the multiplier is the horizontal acceleration in g (`dir` = +1 pushes to the right).
 */
export function tiltRing(shape: RingShape, dir: 1 | -1): KinRing {
  const dead: Load[] = [];
  const live: Load[] = [];
  for (let k = 0; k < shape.area.length; k++) {
    const c = shape.centroid[k]!;
    dead.push(pointLoad(c.x, c.y, 0, -shape.area[k]!));
    live.push(pointLoad(c.x, c.y, dir * shape.area[k]!, 0));
  }
  return { a: shape.a, b: shape.b, dead, live };
}

/** Smallest t/R at which the bare circular ring stands, by bisection on the thickness. */
export function minimumThickness(halfAngleDeg: number, courses: number, lo = 0.005, hi = 0.3, steps = 18): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < steps; i++) {
    const mid = (a + b) / 2;
    if (standsUnderDeadLoad(tiltRing(circularRing(halfAngleDeg, mid, courses), 1))) b = mid;
    else a = mid;
  }
  return b;
}
