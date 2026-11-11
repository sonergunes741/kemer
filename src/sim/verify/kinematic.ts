/**
 * Independent kinematic (upper-bound) limit analysis of one ring of rigid voussoirs.
 *
 * It exists only to check the simulation's static (lower-bound) LP answers and deliberately
 * shares no code with them: no LP, no joint forms, no arch.ts. By the uniqueness theorem of limit
 * analysis the smallest multiplier over all admissible mechanisms must equal the largest multiplier
 * for which a line of thrust fits, on the same discretised ring. Heyman's assumptions: no tension,
 * no sliding, no crushing (compare against the LP with the RIGID joint law).
 *
 * A mechanism of a ring between fixed supports is four hinges at four different joints, each at
 * the intrados or the extrados end of its joint. The three bodies between them move with one
 * degree of freedom; the supports and the stones outside the outer hinges stand still.
 */

export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** Resultant of the forces on one course: force and moment about the origin (x fy - y fx). */
export interface Load {
  fx: number;
  fy: number;
  mo: number;
}

export interface KinRing {
  /** Intrados end and extrados end of every joint, left to right: n + 1 joints for n courses. */
  readonly a: readonly Pt[];
  readonly b: readonly Pt[];
  /** Per course: the loads that stay, and the loads the multiplier scales. */
  readonly dead: readonly Load[];
  readonly live: readonly Load[];
}

/** 0: the hinge is at the intrados end of the joint, 1: at the extrados end. */
export type Side = 0 | 1;

export interface KinMechanism {
  readonly joints: readonly [number, number, number, number];
  readonly sides: readonly [Side, Side, Side, Side];
  /** Rotation rates of the three moving bodies, anticlockwise positive; the first is +1 or -1. */
  readonly omega: readonly [number, number, number];
  /** Work rates of the dead and of the (unit) live loads in that motion. */
  readonly deadWork: number;
  readonly liveWork: number;
}

export interface KinResult {
  /**
   * Smallest multiplier over the admissible mechanisms the live load drives. Infinity when no
   * mechanism is driven by the live load; negative when the dead load alone drives one.
   */
  readonly multiplier: number;
  readonly mechanism: KinMechanism | null;
  /**
   * Largest dead-load work rate over all admissible mechanisms, per unit of the fastest rotation.
   * Positive: the ring falls under its dead load alone.
   */
  readonly deadMargin: number;
  readonly deadMechanism: KinMechanism | null;
  /** Admissible mechanisms found. */
  readonly admissible: number;
}

export interface KinOptions {
  /** Shrink every joint about its centre by this factor before looking for hinges (default 1). */
  readonly alpha?: number;
  /** Try all sixteen side patterns instead of only the two alternating ones. */
  readonly allPatterns?: boolean;
  /** Return as soon as one mechanism is driven by the dead load (for stability bisections). */
  readonly stopAtDeadFailure?: boolean;
}

/** A point load as a Load. */
export function pointLoad(x: number, y: number, fx: number, fy: number): Load {
  return { fx, fy, mo: x * fy - y * fx };
}

export function addLoad(into: Load, x: number, y: number, fx: number, fy: number): void {
  into.fx += fx;
  into.fy += fy;
  into.mo += x * fy - y * fx;
}

/** Area and centroid of a simple polygon (shoelace); the sign of the area follows the winding. */
export function polygonCentroid(points: readonly Pt[]): { area: number; x: number; y: number } {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    const cross = p.x * q.y - q.x * p.y;
    area += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  area /= 2;
  return { area, x: cx / (6 * area), y: cy / (6 * area) };
}

const ALTERNATING: readonly (readonly Side[])[] = [
  [0, 1, 0, 1],
  [1, 0, 1, 0],
];

function allPatterns(): Side[][] {
  const out: Side[][] = [];
  for (let m = 0; m < 16; m++) out.push([(m & 1) as Side, ((m >> 1) & 1) as Side, ((m >> 2) & 1) as Side, ((m >> 3) & 1) as Side]);
  return out;
}

/**
 * Enumerate every four-hinge mechanism of the ring and apply the principle of virtual work.
 *
 * Kinematics, with H1..H4 the hinge points and w1, w2, w3 the rotation rates of the three bodies:
 * body 1 turns about H1, body 3 about H4, and body 2 must agree with both at H2 and H3, which
 * gives w1 (H2 - H1) + w2 (H3 - H2) = w3 (H3 - H4): two equations for w2 and w3 once w1 = +-1.
 *
 * Admissibility: at each hinge the joint may only open away from the hinge point. With the right
 * body turning by dw relative to the left one, a hinge at the intrados end opens the joint at the
 * extrados only when dw < 0 (clockwise), and a hinge at the extrados end only when dw > 0.
 */
export function analyse(ring: KinRing, options: KinOptions = {}): KinResult {
  const n = ring.dead.length;
  const alpha = options.alpha ?? 1;
  const patterns = options.allPatterns ? allPatterns() : ALTERNATING;

  // Hinge points by side and joint.
  const hx = [new Float64Array(n + 1), new Float64Array(n + 1)];
  const hy = [new Float64Array(n + 1), new Float64Array(n + 1)];
  let size = 0;
  for (let j = 0; j <= n; j++) {
    const a = ring.a[j]!;
    const b = ring.b[j]!;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    hx[0]![j] = cx + (alpha * (a.x - b.x)) / 2;
    hy[0]![j] = cy + (alpha * (a.y - b.y)) / 2;
    hx[1]![j] = cx + (alpha * (b.x - a.x)) / 2;
    hy[1]![j] = cy + (alpha * (b.y - a.y)) / 2;
    size = Math.max(size, Math.abs(a.x - ring.a[0]!.x), Math.abs(a.y - ring.a[0]!.y));
  }
  // Prefix sums of the loads: sums over courses 0..j-1.
  const sum = (loads: readonly Load[], pick: (l: Load) => number): Float64Array => {
    const out = new Float64Array(n + 1);
    for (let k = 0; k < n; k++) out[k + 1] = out[k]! + pick(loads[k]!);
    return out;
  };
  const dX = sum(ring.dead, (l) => l.fx);
  const dY = sum(ring.dead, (l) => l.fy);
  const dM = sum(ring.dead, (l) => l.mo);
  const lX = sum(ring.live, (l) => l.fx);
  const lY = sum(ring.live, (l) => l.fy);
  const lM = sum(ring.live, (l) => l.mo);
  let weight = 0;
  for (const l of ring.dead) weight += Math.abs(l.fx) + Math.abs(l.fy);
  const workTol = 1e-11 * Math.max(1e-30, weight * size);
  const detTol = 1e-12 * size * size;

  let best = Infinity;
  let bestMech: KinMechanism | null = null;
  let deadMargin = -Infinity;
  let deadMech: KinMechanism | null = null;
  let admissible = 0;

  for (const pattern of patterns) {
    const s1 = pattern[0]!;
    const s2 = pattern[1]!;
    const s3 = pattern[2]!;
    const s4 = pattern[3]!;
    // +1 where the relative rotation must be positive (extrados hinge), -1 where negative.
    const g1 = s1 === 1 ? 1 : -1;
    const g2 = s2 === 1 ? 1 : -1;
    const g3 = s3 === 1 ? 1 : -1;
    const g4 = s4 === 1 ? 1 : -1;
    const x1 = hx[s1]!;
    const y1 = hy[s1]!;
    const x2 = hx[s2]!;
    const y2 = hy[s2]!;
    const x3 = hx[s3]!;
    const y3 = hy[s3]!;
    const x4 = hx[s4]!;
    const y4 = hy[s4]!;
    for (let j1 = 0; j1 <= n - 3; j1++) {
      const h1x = x1[j1]!;
      const h1y = y1[j1]!;
      for (let j2 = j1 + 1; j2 <= n - 2; j2++) {
        const h2x = x2[j2]!;
        const h2y = y2[j2]!;
        const cx = h1x - h2x;
        const cy = h1y - h2y;
        for (let j3 = j2 + 1; j3 <= n - 1; j3++) {
          const h3x = x3[j3]!;
          const h3y = y3[j3]!;
          const ax = h3x - h2x;
          const ay = h3y - h2y;
          for (let j4 = j3 + 1; j4 <= n; j4++) {
            const h4x = x4[j4]!;
            const h4y = y4[j4]!;
            const bx = h4x - h3x;
            const by = h4y - h3y;
            const det = ax * by - ay * bx;
            if (Math.abs(det) < detTol) continue;
            const w2 = (cx * by - cy * bx) / det;
            const w3 = (ax * cy - ay * cx) / det;
            // Relative rotations at the four hinges for w1 = +1, signed so that >= 0 is admissible.
            const r1 = g1;
            const r2 = g2 * (w2 - 1);
            const r3 = g3 * (w3 - w2);
            const r4 = -g4 * w3;
            let dir = 0;
            if (r1 >= 0 && r2 >= 0 && r3 >= 0 && r4 >= 0) dir = 1;
            else if (r1 <= 0 && r2 <= 0 && r3 <= 0 && r4 <= 0) dir = -1;
            if (dir === 0) continue;
            admissible++;
            // Velocity of the material point at the origin, per body (for w1 = +1).
            const v2x = -(h2y - h1y) + w2 * h2y;
            const v2y = h2x - h1x - w2 * h2x;
            const work = (X: Float64Array, Y: Float64Array, M: Float64Array): number => {
              const f1x = X[j2]! - X[j1]!;
              const f1y = Y[j2]! - Y[j1]!;
              const f2x = X[j3]! - X[j2]!;
              const f2y = Y[j3]! - Y[j2]!;
              const f3x = X[j4]! - X[j3]!;
              const f3y = Y[j4]! - Y[j3]!;
              return (
                f1x * h1y - f1y * h1x + (M[j2]! - M[j1]!) +
                f2x * v2x + f2y * v2y + w2 * (M[j3]! - M[j2]!) +
                w3 * (f3x * h4y - f3y * h4x + (M[j4]! - M[j3]!))
              );
            };
            const wd = dir * work(dX, dY, dM);
            const wl = dir * work(lX, lY, lM);
            const fastest = Math.max(1, Math.abs(w2), Math.abs(w3));
            const margin = wd / fastest;
            const make = (): KinMechanism => ({ joints: [j1, j2, j3, j4], sides: [s1, s2, s3, s4], omega: [dir, dir * w2, dir * w3], deadWork: wd, liveWork: wl });
            if (margin > deadMargin) {
              deadMargin = margin;
              deadMech = make();
              if (options.stopAtDeadFailure && margin > workTol) {
                return { multiplier: -Infinity, mechanism: deadMech, deadMargin, deadMechanism: deadMech, admissible };
              }
            }
            if (wl / fastest > workTol) {
              const lambda = -wd / wl;
              if (lambda < best) {
                best = lambda;
                bestMech = make();
              }
            }
          }
        }
      }
    }
  }
  return { multiplier: best, mechanism: bestMech, deadMargin, deadMechanism: deadMech, admissible };
}

/**
 * One given mechanism (four joints left to right, a side each), written out plainly so it can also
 * check the enumeration above. `direction` is +1 when the mechanism is admissible with the first
 * body turning anticlockwise, -1 clockwise, 0 when it cannot move without a joint overlapping.
 * Work rates are for that direction (for +1 when it is 0).
 */
export function evaluate(ring: KinRing, joints: readonly number[], sides: readonly Side[]): { direction: 1 | -1 | 0; omega: [number, number, number]; deadWork: number; liveWork: number } {
  const h = joints.map((j, i) => (sides[i] === 0 ? ring.a[j]! : ring.b[j]!));
  const [h1, h2, h3, h4] = [h[0]!, h[1]!, h[2]!, h[3]!];
  const ax = h3.x - h2.x;
  const ay = h3.y - h2.y;
  const bx = h4.x - h3.x;
  const by = h4.y - h3.y;
  const cx = h1.x - h2.x;
  const cy = h1.y - h2.y;
  const det = ax * by - ay * bx;
  const w2 = (cx * by - cy * bx) / det;
  const w3 = (ax * cy - ay * cx) / det;
  const relative = [1, w2 - 1, w3 - w2, -w3];
  const signed = relative.map((r, i) => (sides[i] === 1 ? r : -r));
  const direction = signed.every((r) => r >= -1e-12) ? 1 : signed.every((r) => r <= 1e-12) ? -1 : 0;
  // Velocity of a point p of body b: body 1 turns about h1, body 3 about h4, body 2 follows h2.
  const velocity = (body: number, p: Pt): Pt => {
    if (body === 1) return { x: -(p.y - h1.y), y: p.x - h1.x };
    if (body === 3) return { x: -w3 * (p.y - h4.y), y: w3 * (p.x - h4.x) };
    return { x: -(h2.y - h1.y) - w2 * (p.y - h2.y), y: h2.x - h1.x + w2 * (p.x - h2.x) };
  };
  const work = (loads: readonly Load[]): number => {
    let sum = 0;
    for (let k = joints[0]!; k < joints[3]!; k++) {
      const body = k < joints[1]! ? 1 : k < joints[2]! ? 2 : 3;
      const l = loads[k]!;
      // A force system (fx, fy, mo) does work f . v(origin) + w mo on a body turning at rate w.
      const v0 = velocity(body, { x: 0, y: 0 });
      const w = body === 1 ? 1 : body === 2 ? w2 : w3;
      sum += l.fx * v0.x + l.fy * v0.y + w * l.mo;
    }
    return sum;
  };
  const sign = direction === 0 ? 1 : direction;
  return { direction, omega: [sign, sign * w2, sign * w3], deadWork: sign * work(ring.dead), liveWork: sign * work(ring.live) };
}

/** True when no admissible mechanism is driven by the dead load (joints shrunk by alpha). */
export function standsUnderDeadLoad(ring: KinRing, alpha = 1, allPatterns = false): boolean {
  const r = analyse(ring, { alpha, stopAtDeadFailure: true, allPatterns });
  let weight = 0;
  for (const l of ring.dead) weight += Math.abs(l.fx) + Math.abs(l.fy);
  return !(r.deadMargin > 1e-10 * weight);
}

/**
 * Kinematic counterpart of the geometric factor of safety: the smallest factor by which every
 * joint can shrink about its centre with no mechanism driven by the dead load. gsf = 1 / alpha.
 */
export function minimumAlpha(ring: KinRing, lo = 0.02, hi = 4, steps = 26): number {
  if (!standsUnderDeadLoad(ring, hi)) return Infinity;
  if (standsUnderDeadLoad(ring, lo)) return lo;
  let a = lo;
  let b = hi;
  for (let i = 0; i < steps; i++) {
    const mid = (a + b) / 2;
    if (standsUnderDeadLoad(ring, mid)) b = mid;
    else a = mid;
  }
  return b;
}
