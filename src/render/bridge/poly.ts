/**
 * Small 2D helpers for cutting stones: polygon area and orientation, inward offsets, corner
 * chamfers and reading a polyline as a function of x. Pure and allocation-light; no three.js.
 */
import type { Vec2 } from '../../core/types';

export function signedArea(p: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const u = p[i]!;
    const v = p[(i + 1) % n]!;
    a += u.x * v.y - v.x * u.y;
  }
  return a / 2;
}

export function centroid(p: readonly Vec2[]): Vec2 {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const u = p[i]!;
    const v = p[(i + 1) % n]!;
    const c = u.x * v.y - v.x * u.y;
    a += c;
    cx += (u.x + v.x) * c;
    cy += (u.y + v.y) * c;
  }
  if (Math.abs(a) < 1e-12) {
    let sx = 0;
    let sy = 0;
    for (const q of p) {
      sx += q.x;
      sy += q.y;
    }
    return { x: sx / Math.max(1, p.length), y: sy / Math.max(1, p.length) };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** Counter-clockwise copy (outward normals then point to the right of each edge). */
export function ccw(p: readonly Vec2[]): Vec2[] {
  const out = p.map((q) => ({ x: q.x, y: q.y }));
  if (signedArea(out) < 0) out.reverse();
  return out;
}

/** Drop repeated points and points on a straight line between their neighbours. */
export function simplify(p: readonly Vec2[], eps = 1e-4): Vec2[] {
  const out: Vec2[] = [];
  for (const q of p) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(q.x - last.x, q.y - last.y) > eps) out.push({ x: q.x, y: q.y });
  }
  if (out.length > 2) {
    const a = out[0]!;
    const b = out[out.length - 1]!;
    if (Math.hypot(a.x - b.x, a.y - b.y) <= eps) out.pop();
  }
  for (let i = 0; i < out.length && out.length > 3; ) {
    const n = out.length;
    const a = out[(i + n - 1) % n]!;
    const b = out[i]!;
    const c = out[(i + 1) % n]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const len = Math.hypot(c.x - a.x, c.y - a.y);
    if (Math.abs(cross) / Math.max(len, 1e-9) < eps * 0.5) out.splice(i, 1);
    else i++;
  }
  return out;
}

/**
 * Douglas-Peucker on a closed polygon: drop points closer than `tol` to the line between kept
 * neighbours. Curved edges sampled every few centimetres keep only what the eye can see.
 */
export function reduce(p: readonly Vec2[], tol: number): Vec2[] {
  const n = p.length;
  if (n <= 4) return [...p];
  // Split at the two points farthest apart so each half is an open polyline.
  let far = 0;
  let best = -1;
  for (let i = 1; i < n; i++) {
    const d = (p[i]!.x - p[0]!.x) ** 2 + (p[i]!.y - p[0]!.y) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[far] = 1;
  const stack: [number, number][] = [
    [0, far],
    [far, n],
  ];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    if (b - a < 2) continue;
    const pa = p[a % n]!;
    const pb = p[b % n]!;
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy) || 1e-12;
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const q = p[i]!;
      const d = Math.abs((q.x - pa.x) * dy - (q.y - pa.y) * dx) / len;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i]!);
  return out.length >= 3 ? out : [...p];
}

/** Turning angle at each vertex of a closed polygon (radians, 0 = straight). */
export function turnAngles(p: readonly Vec2[]): number[] {
  const n = p.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = p[(i + n - 1) % n]!;
    const b = p[i]!;
    const c = p[(i + 1) % n]!;
    const a1 = Math.atan2(b.y - a.y, b.x - a.x);
    const a2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = a2 - a1;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    out.push(Math.abs(d));
  }
  return out;
}

/**
 * Inward miter offset of a counter-clockwise polygon by `d` (negative grows it). Miters are
 * clamped so sharp corners do not shoot out. Returns null when the result folds over itself.
 */
export function inset(p: readonly Vec2[], d: number): Vec2[] | null {
  const n = p.length;
  if (n < 3) return null;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = p[(i + n - 1) % n]!;
    const b = p[i]!;
    const c = p[(i + 1) % n]!;
    let e1x = b.x - a.x;
    let e1y = b.y - a.y;
    let e2x = c.x - b.x;
    let e2y = c.y - b.y;
    const l1 = Math.hypot(e1x, e1y) || 1;
    const l2 = Math.hypot(e2x, e2y) || 1;
    e1x /= l1;
    e1y /= l1;
    e2x /= l2;
    e2y /= l2;
    // Inward normals of a CCW polygon point to the left of each edge.
    const n1x = -e1y;
    const n1y = e1x;
    const n2x = -e2y;
    const n2y = e2x;
    let mx = n1x + n2x;
    let my = n1y + n2y;
    const ml = Math.hypot(mx, my);
    if (ml < 1e-6) {
      mx = n1x;
      my = n1y;
    } else {
      mx /= ml;
      my /= ml;
    }
    const cosHalf = Math.max(0.35, mx * n1x + my * n1y);
    const k = d / cosHalf;
    out.push({ x: b.x + mx * k, y: b.y + my * k });
  }
  const before = signedArea(p);
  const after = signedArea(out);
  if (before <= 0 || after <= before * 0.05 || (d > 0 && after > before)) return null;
  return out;
}

/**
 * Cut every corner sharper than `minTurn` back by `size` along both edges (at most a third of
 * the shorter edge), so the long edges of a stone get a narrow bevel too. Returns the polygon and
 * which vertices sit at a corner that stays sharp (none when everything was chamfered).
 */
export function chamfer(p: readonly Vec2[], size: number, minTurn = 0.45): { points: Vec2[]; sharp: boolean[] } {
  const n = p.length;
  const turns = turnAngles(p);
  const points: Vec2[] = [];
  const sharp: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const b = p[i]!;
    if (turns[i]! < minTurn || size <= 0) {
      points.push({ x: b.x, y: b.y });
      sharp.push(size <= 0 && turns[i]! >= minTurn);
      continue;
    }
    const a = p[(i + n - 1) % n]!;
    const c = p[(i + 1) % n]!;
    const la = Math.hypot(a.x - b.x, a.y - b.y);
    const lc = Math.hypot(c.x - b.x, c.y - b.y);
    const s = Math.min(size, la / 3, lc / 3);
    if (s < 1e-3) {
      points.push({ x: b.x, y: b.y });
      sharp.push(true);
      continue;
    }
    points.push({ x: b.x + ((a.x - b.x) / la) * s, y: b.y + ((a.y - b.y) / la) * s });
    points.push({ x: b.x + ((c.x - b.x) / lc) * s, y: b.y + ((c.y - b.y) / lc) * s });
    sharp.push(false, false);
  }
  return { points, sharp };
}

/** A polyline read as y(x) by linear interpolation (x ascending), clamped at its ends. */
export class Profile {
  private readonly xs: Float64Array;
  private readonly ys: Float64Array;

  constructor(points: readonly Vec2[]) {
    const sorted = [...points].sort((a, b) => a.x - b.x);
    this.xs = new Float64Array(sorted.map((p) => p.x));
    this.ys = new Float64Array(sorted.map((p) => p.y));
  }

  get x0(): number {
    return this.xs[0] ?? 0;
  }

  get x1(): number {
    return this.xs[this.xs.length - 1] ?? 0;
  }

  at(x: number): number {
    const xs = this.xs;
    const n = xs.length;
    if (n === 0) return 0;
    if (x <= xs[0]!) return this.ys[0]!;
    if (x >= xs[n - 1]!) return this.ys[n - 1]!;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid]! <= x) lo = mid;
      else hi = mid;
    }
    const t = (x - xs[lo]!) / Math.max(1e-12, xs[hi]! - xs[lo]!);
    return this.ys[lo]! + (this.ys[hi]! - this.ys[lo]!) * t;
  }
}

/** y on the straight segment a-b at x (a.x !== b.x), clamped to the segment. */
export function lineAt(a: Vec2, b: Vec2, x: number): number {
  const d = b.x - a.x;
  if (Math.abs(d) < 1e-9) return Math.max(a.y, b.y);
  const t = Math.min(1, Math.max(0, (x - a.x) / d));
  return a.y + (b.y - a.y) * t;
}
