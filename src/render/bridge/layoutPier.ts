/**
 * Piers as dressed shells laid in courses around their plan (with a pointed cutwater upstream and
 * a rounded end downstream when the design has cutwaters), a solid top course for the arches to
 * spring from, and stepped caps over the cutwaters.
 */
import type { PierGeometry, Vec2 } from '../../core/types';
import { splitRange, type Ctx } from './layoutRing';
import { ccw, centroid, inset, signedArea } from './poly';
import type { StoneShape } from './types';

/** Plan outline of a pier, counter-clockwise in (x, z). */
export function pierPlan(p: PierGeometry, half: number): Vec2[] {
  const r = p.width / 2;
  const x0 = p.x - r;
  const x1 = p.x + r;
  if (!p.cutwater) {
    return [
      { x: x0, y: -half },
      { x: x1, y: -half },
      { x: x1, y: half },
      { x: x0, y: half },
    ];
  }
  const pts: Vec2[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI + (Math.PI * i) / steps;
    pts.push({ x: p.x + Math.cos(a) * r, y: -half + Math.sin(a) * r });
  }
  pts.push({ x: x1, y: half }, { x: p.x, y: half + p.width * 0.75 }, { x: x0, y: half });
  return ccw(pts);
}

/** Point at arc length s along a closed polyline, with the segment it falls on. */
function along(poly: readonly Vec2[], cum: readonly number[], s: number): { seg: number; t: number } {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    if (s <= cum[i + 1]! + 1e-9) return { seg: i, t: (s - cum[i]!) / Math.max(1e-9, cum[i + 1]! - cum[i]!) };
  }
  return { seg: n - 1, t: 1 };
}

function lerpPt(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Clip a convex polygon to z0 <= z <= z1 (z is the polygon's y). */
function clipZ(poly: readonly Vec2[], z0: number, z1: number): Vec2[] {
  const clip = (pts: readonly Vec2[], keep: (p: Vec2) => number): Vec2[] => {
    const out: Vec2[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const da = keep(a);
      const db = keep(b);
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) out.push(lerpPt(a, b, da / (da - db)));
    }
    return out;
  };
  return clip(
    clip(poly, (p) => p.y - z0),
    (p) => z1 - p.y,
  );
}

export function pierStones(ctx: Ctx, p: PierGeometry, arcade: boolean): void {
  const { half, out } = ctx;
  const outer = pierPlan(p, half);
  const shell = Math.min(0.5, p.width * 0.3);
  const inner = inset(outer, shell) ?? outer.map((q) => ({ x: p.x + (q.x - p.x) * 0.6, y: q.y * 0.6 }));
  const n = outer.length;
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const a = outer[i]!;
    const b = outer[(i + 1) % n]!;
    cum.push(cum[i]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const perimeter = cum[n]!;
  const h = ctx.blockHeight;
  const ys: number[] = [p.top];
  let y = p.top;
  while (y > p.base + 0.05) {
    // Foundation courses below the bed are coarser and taller.
    const deep = y < p.bed - 0.3;
    y -= h * (deep ? 1.5 : ctx.rng.range(1.0, 1.2));
    ys.unshift(Math.max(p.base, y));
  }
  const add = (shape: StoneShape, c: Vec2, yc: number, volume: number, course: number): void => {
    out.push({
      kind: 'pier',
      shape,
      span: -1,
      voussoir: -1,
      pier: p.index,
      follow: [-1, -1],
      followPier: p.index,
      pivot: { x: c.x, y: yc, z: c.y },
      volume,
      order: course,
      material: 0,
      arcade,
    });
  };
  for (let k = 0; k < ys.length - 1; k++) {
    const y0 = ys[k]!;
    const y1 = ys[k + 1]!;
    const deep = y1 < p.bed - 0.3;
    const nominal = ctx.blockLength * (deep ? 2.6 : ctx.split === 0 ? 2.4 : 1.6);
    const cuts = splitRange(0, perimeter, nominal, k % 2 === 0 ? 0 : 0.5, ctx.rng);
    for (let c = 0; c < cuts.length - 1; c++) {
      const a = along(outer, cum, cuts[c]!);
      const b = along(outer, cum, cuts[c + 1]!);
      const o: Vec2[] = [lerpPt(outer[a.seg]!, outer[(a.seg + 1) % n]!, a.t)];
      const iPts: Vec2[] = [lerpPt(inner[a.seg]!, inner[(a.seg + 1) % n]!, a.t)];
      for (let s = a.seg + 1; s <= b.seg; s++) {
        o.push(outer[s % n]!);
        iPts.push(inner[s % n]!);
      }
      o.push(lerpPt(outer[b.seg]!, outer[(b.seg + 1) % n]!, b.t));
      iPts.push(lerpPt(inner[b.seg]!, inner[(b.seg + 1) % n]!, b.t));
      const poly = [...o, ...iPts.reverse()];
      const area = Math.abs(signedArea(poly));
      if (area < 0.003) continue;
      add({ plane: 'xz', poly, w0: y0, w1: y1 }, centroid(poly), (y0 + y1) / 2, area * (y1 - y0), k);
    }
    if (k === ys.length - 2) {
      // The top course is solid, so the pier never shows its hollow while the arches go up.
      const zs = splitRange(-half - p.width, half + p.width, 1.3, 0.3, ctx.rng);
      for (let c = 0; c < zs.length - 1; c++) {
        const poly = clipZ(inner, zs[c]!, zs[c + 1]!);
        if (poly.length < 3) continue;
        const area = Math.abs(signedArea(poly));
        if (area < 0.003) continue;
        add({ plane: 'xz', poly, w0: y0, w1: y1 }, centroid(poly), (y0 + y1) / 2, area * (y1 - y0), k);
      }
    }
  }
  if (!p.cutwater) return;
  // Caps over the cutwaters, leaning on the face walls and built in courses that step in towards
  // the wall: pointed upstream, a half round downstream.
  const r = p.width / 2;
  const nose: Vec2[] = [
    { x: p.x + r, y: half },
    { x: p.x, y: half + p.width * 0.75 },
    { x: p.x - r, y: half },
  ];
  const tail: Vec2[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + (Math.PI * i) / 8;
    tail.push({ x: p.x + Math.cos(a) * r, y: -half + Math.sin(a) * r });
  }
  const capCourses = (plan: readonly Vec2[], apex: Vec2, height: number): void => {
    // Half-height courses keep the steps small, so the cap reads as a slope rather than a stair.
    const steps = Math.max(2, Math.round(height / (h * 0.55)));
    for (let k = 0; k < steps; k++) {
      const f = 1 - k / steps;
      const poly = ccw(plan.map((q) => ({ x: apex.x + (q.x - apex.x) * f, y: apex.y + (q.y - apex.y) * f })));
      const area = Math.abs(signedArea(poly));
      if (area < 0.01) continue;
      const y0 = p.top + (height * k) / steps;
      const y1 = p.top + (height * (k + 1)) / steps;
      add({ plane: 'xz', poly, w0: y0, w1: y1 }, centroid(poly), (y0 + y1) / 2, area * (y1 - y0), ys.length + k);
    }
  };
  capCourses(nose, { x: p.x, y: half }, p.width * 0.6);
  capCourses(tail, { x: p.x, y: -half }, r * 0.8);
}
