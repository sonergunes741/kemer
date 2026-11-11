/**
 * The arch curve family and its voussoirs (SIM-SPEC section 1).
 *
 * Each half of the intrados is one circular arc from the springing to the crown. Everything the
 * statics needs (joint ends, exact areas and centroids) comes straight from the arc parameters;
 * the polyline outlines exist only for drawing.
 */
import { DEG2RAD, clamp } from '../core/math';
import type { Joint, SpanGeometry, Vec2, Voussoir } from '../core/types';
import {
  BETA_MIN_DEG,
  CHORD_ERROR,
  COURSES_MAX,
  COURSES_MIN,
  COURSE_BASE,
  COURSE_MAX,
  COURSE_MIN,
  COURSE_PER_T,
} from './tuning';

/** Analytic description of one ring. Angles are seen from the centre of the LEFT arc. */
export interface ArchShape {
  readonly xL: number;
  readonly xR: number;
  /** Springing level and centre line. */
  readonly ys: number;
  readonly xc: number;
  readonly span: number;
  readonly rise: number;
  readonly t: number;
  /** Intrados radius and centre of the left arc (the right arc is its mirror image). */
  readonly r: number;
  readonly ox: number;
  readonly oy: number;
  /** Angle of the left springing and of the crown; the arc runs clockwise from thetaS to thetaK. */
  readonly thetaS: number;
  readonly thetaK: number;
  /** Courses (odd) and the angle one course subtends. */
  readonly n: number;
  readonly step: number;
  /** True when the two arcs meet at an angle at the crown. */
  readonly pointed: boolean;
  /** Angle at which the left extrados arc reaches the centre line, and that apex's height. */
  readonly thetaE: number;
  readonly apexY: number;
}

/** Nearest odd integer. */
function odd(x: number): number {
  return 2 * Math.round((x - 1) / 2) + 1;
}

/**
 * Build the shape of a span. `courses` overrides the course count (benchmarks ask for about 80);
 * it is forced odd so a keystone straddles the crown.
 */
export function archShape(xL: number, xR: number, ys: number, rise: number, fullness: number, t: number, courses?: number): ArchShape {
  const span = xR - xL;
  const half = span / 2;
  const xc = xL + half;
  const chord = Math.sqrt(half * half + rise * rise);
  const phi = Math.atan2(rise, half);
  const betaMin = BETA_MIN_DEG * DEG2RAD;
  const betaMax = Math.max(betaMin, Math.min(phi, Math.PI / 2 - phi));
  const beta = betaMin + clamp(fullness, 0, 1) * (betaMax - betaMin);
  const r = chord / (2 * Math.sin(beta));
  const pointed = phi - beta > 1e-7;
  // Centre = chord midpoint + r cos(beta) along the inward normal (sin phi, -cos phi).
  const along = r * Math.cos(beta);
  const ox = pointed ? xL + half / 2 + along * Math.sin(phi) : xc;
  const oy = ys + rise / 2 - along * Math.cos(phi);
  // The springing is left of the centre and never below it; with a vertical springing tangent it
  // is level with it, and rounding must not flip the angle from +pi to -pi.
  const rawS = Math.atan2(ys - oy, xL - ox);
  const thetaS = rawS < 0 ? rawS + 2 * Math.PI : rawS;
  const thetaK = Math.atan2(ys + rise - oy, xc - ox);

  let n: number;
  if (courses !== undefined) {
    n = Math.max(3, odd(courses));
  } else {
    const width = clamp(COURSE_BASE + COURSE_PER_T * t, COURSE_MIN, COURSE_MAX);
    n = clamp(odd((2 * r * (thetaS - thetaK)) / width), COURSES_MIN, COURSES_MAX);
  }
  const step = (2 * (thetaS - thetaK)) / n;

  const ro = r + t;
  const dx = xc - ox;
  const apexY = oy + Math.sqrt(Math.max(0, ro * ro - dx * dx));
  const thetaE = pointed ? Math.atan2(apexY - oy, dx) : thetaK;
  return { xL, xR, ys, xc, span, rise, t, r, ox, oy, thetaS, thetaK, n, step, pointed, thetaE, apexY };
}

/** Height of the intrados at x (x between the springings). */
export function intradosY(a: ArchShape, x: number): number {
  const xm = x <= a.xc ? x : 2 * a.xc - x;
  const dx = xm - a.ox;
  const v = a.r * a.r - dx * dx;
  return v > 0 ? a.oy + Math.sqrt(v) : a.oy;
}

/** Height of the extrados at x (x between the extrados feet, see extradosFoot). */
export function extradosY(a: ArchShape, x: number): number {
  const xm = x <= a.xc ? x : 2 * a.xc - x;
  const dx = xm - a.ox;
  const ro = a.r + a.t;
  const v = ro * ro - dx * dx;
  return v > 0 ? a.oy + Math.sqrt(v) : a.oy;
}

/** x of the left end of the extrados (the outer end of the left springing joint). */
export function extradosFoot(a: ArchShape): number {
  return a.ox + (a.r + a.t) * Math.cos(a.thetaS);
}

/**
 * Joint ends into typed arrays of length n + 1: intrados end (ax, ay) and extrados end (bx, by).
 * joints[i] is the left face of course i; joints[n] is the right springing.
 */
export function archJoints(a: ArchShape, ax: Float64Array, ay: Float64Array, bx: Float64Array, by: Float64Array): void {
  const h = (a.n - 1) / 2;
  const ro = a.r + a.t;
  for (let i = 0; i <= h; i++) {
    const th = a.thetaS - i * a.step;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const j = a.n - i;
    ax[i] = a.ox + a.r * c;
    ay[i] = a.oy + a.r * s;
    bx[i] = a.ox + ro * c;
    by[i] = a.oy + ro * s;
    ax[j] = 2 * a.xc - (ax[i] as number);
    ay[j] = ay[i] as number;
    bx[j] = 2 * a.xc - (bx[i] as number);
    by[j] = by[i] as number;
  }
}

/** Distance of an annular sector's centroid from the arc centre, along its bisector. */
function sectorCentroidRadius(ri: number, ro: number, angle: number): number {
  const halfAngle = angle / 2;
  return ((2 / 3) * (ro * ro * ro - ri * ri * ri) * Math.sin(halfAngle)) / ((ro * ro - ri * ri) * halfAngle);
}

/** Exact elevation area and centroid of every course, into typed arrays of length n. */
export function archBlocks(a: ArchShape, area: Float64Array, cx: Float64Array, cy: Float64Array): void {
  const h = (a.n - 1) / 2;
  const ri = a.r;
  const ro = a.r + a.t;
  const sector = ((ro * ro - ri * ri) * a.step) / 2;
  const rc = sectorCentroidRadius(ri, ro, a.step);
  for (let k = 0; k < h; k++) {
    const mid = a.thetaS - (k + 0.5) * a.step;
    const j = a.n - 1 - k;
    area[k] = sector;
    cx[k] = a.ox + rc * Math.cos(mid);
    cy[k] = a.oy + rc * Math.sin(mid);
    area[j] = sector;
    cx[j] = 2 * a.xc - (cx[k] as number);
    cy[j] = cy[k] as number;
  }
  if (!a.pointed) {
    area[h] = sector;
    cx[h] = a.xc;
    cy[h] = a.oy + rc;
    return;
  }
  // Pointed keystone, left half: the sector up to the radial line through the crown, plus the
  // sliver between that line, the extrados arc and the centre line (a full sector of radius ro
  // minus the triangle centre-crown-apex). The right half mirrors it, so the centroid is on xc.
  const halfStep = a.step / 2;
  const a1 = ((ro * ro - ri * ri) * halfStep) / 2;
  const y1 = a.oy + sectorCentroidRadius(ri, ro, halfStep) * Math.sin(a.thetaK + halfStep / 2);
  const delta = a.thetaK - a.thetaE;
  const a2 = (ro * ro * delta) / 2;
  const y2 = delta > 1e-12 ? a.oy + ((4 * ro * Math.sin(delta / 2)) / (3 * delta)) * Math.sin(a.thetaK - delta / 2) : a.oy;
  const kx = a.xc - a.ox;
  const ky = a.ys + a.rise - a.oy;
  const ey = a.apexY - a.oy;
  const a3 = Math.abs(kx * ey - ky * kx) / 2;
  const y3 = a.oy + (ky + ey) / 3;
  const halfArea = a1 + a2 - a3;
  area[h] = 2 * halfArea;
  cx[h] = a.xc;
  cy[h] = (a1 * y1 + a2 * y2 - a3 * y3) / halfArea;
}

/** Points on an arc of the left circle from angle t0 to t1 (inclusive), fine enough for CHORD_ERROR. */
function arcPoints(a: ArchShape, radius: number, t0: number, t1: number, out: Vec2[], skipFirst: boolean): void {
  const sweep = Math.abs(t1 - t0);
  const maxStep = 2 * Math.acos(Math.max(0, 1 - CHORD_ERROR / radius));
  const segments = Math.max(1, Math.ceil(sweep / maxStep - 1e-9));
  for (let i = skipFirst ? 1 : 0; i <= segments; i++) {
    const th = t0 + ((t1 - t0) * i) / segments;
    out.push({ x: a.ox + radius * Math.cos(th), y: a.oy + radius * Math.sin(th) });
  }
}

function mirrored(a: ArchShape, points: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = points.length - 1; i >= 0; i--) out.push({ x: 2 * a.xc - (points[i] as Vec2).x, y: (points[i] as Vec2).y });
  return out;
}

/** The public geometry of one span: joints, voussoirs with outlines, and dense drawing polylines. */
export function spanGeometry(a: ArchShape, index: number): SpanGeometry {
  const n = a.n;
  const h = (n - 1) / 2;
  const ro = a.r + a.t;
  const ax = new Float64Array(n + 1);
  const ay = new Float64Array(n + 1);
  const bx = new Float64Array(n + 1);
  const by = new Float64Array(n + 1);
  const area = new Float64Array(n);
  const cx = new Float64Array(n);
  const cy = new Float64Array(n);
  archJoints(a, ax, ay, bx, by);
  archBlocks(a, area, cx, cy);

  const joints: Joint[] = [];
  for (let j = 0; j <= n; j++) joints.push({ a: { x: ax[j] as number, y: ay[j] as number }, b: { x: bx[j] as number, y: by[j] as number } });

  // Lower (left to right) and upper (right to left) edge of every course.
  const lower: Vec2[][] = new Array<Vec2[]>(n);
  const upper: Vec2[][] = new Array<Vec2[]>(n);
  for (let k = 0; k < h; k++) {
    const t0 = a.thetaS - k * a.step;
    const lo: Vec2[] = [];
    const up: Vec2[] = [];
    arcPoints(a, a.r, t0, t0 - a.step, lo, false);
    arcPoints(a, ro, t0 - a.step, t0, up, false);
    lower[k] = lo;
    upper[k] = up;
    lower[n - 1 - k] = mirrored(a, lo);
    upper[n - 1 - k] = mirrored(a, up);
  }
  {
    // Keystone: left half to the centre line, then its mirror image.
    const t0 = a.thetaS - h * a.step;
    const lo: Vec2[] = [];
    const up: Vec2[] = [];
    arcPoints(a, a.r, t0, a.thetaK, lo, false);
    arcPoints(a, ro, a.thetaE, t0, up, false);
    const loRight = mirrored(a, lo);
    const upRight = mirrored(a, up);
    lower[h] = lo.concat(loRight.slice(1));
    upper[h] = upRight.concat(up.slice(1));
  }

  const voussoirs: Voussoir[] = [];
  const intrados: Vec2[] = [];
  const extrados: Vec2[] = [];
  for (let k = 0; k < n; k++) {
    const lo = lower[k] as Vec2[];
    const up = upper[k] as Vec2[];
    voussoirs.push({
      index: k,
      outline: lo.concat(up),
      centroid: { x: cx[k] as number, y: cy[k] as number },
      area: area[k] as number,
      keystone: k === h,
    });
    for (let i = k === 0 ? 0 : 1; i < lo.length; i++) intrados.push(lo[i] as Vec2);
    for (let i = up.length - 1 - (k === 0 ? 0 : 1); i >= 0; i--) extrados.push(up[i] as Vec2);
  }

  return {
    index,
    left: { x: a.xL, y: a.ys },
    right: { x: a.xR, y: a.ys },
    crown: { x: a.xc, y: a.ys + a.rise },
    span: a.span,
    joints,
    voussoirs,
    intrados,
    extrados,
  };
}
