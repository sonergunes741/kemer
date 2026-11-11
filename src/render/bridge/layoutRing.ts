/**
 * The arch rings: every voussoir course of every span, split across the width into staggered
 * stones (the keystone is one long through-stone), and the small relief arches through the
 * spandrels.
 */
import type { Rng } from '../../core/rng';
import type { BridgeGeometry, SpanGeometry, Vec2 } from '../../core/types';
import { centroid, signedArea } from './poly';
import type { StoneSpec } from './types';

/** Radial thickness of the ring around a relief opening, metres. */
export const RELIEF_RING = 0.28;

export interface Ctx {
  readonly g: BridgeGeometry;
  readonly half: number;
  readonly blockLength: number;
  readonly blockHeight: number;
  readonly split: 0 | 1 | 2;
  readonly rng: Rng;
  readonly out: StoneSpec[];
}

/**
 * Cut [a, b] into pieces of about `nominal`, the first one shortened by `phase` (0..1) so that
 * courses above one another do not share joints. A short last piece joins its neighbour.
 */
export function splitRange(a: number, b: number, nominal: number, phase: number, rng: Rng): number[] {
  const cuts = [a];
  const total = b - a;
  if (total <= nominal * 1.35) {
    cuts.push(b);
    return cuts;
  }
  let x = a + nominal * (phase > 0.05 ? phase : 1) * rng.range(0.85, 1.15);
  while (x < b - nominal * 0.45) {
    cuts.push(x);
    x += nominal * rng.range(0.78, 1.25);
  }
  cuts.push(b);
  return cuts;
}

function halfDepth(span: SpanGeometry, v: number): number {
  const n = span.voussoirs.length;
  const mid = (n - 1) / 2;
  return mid > 0 ? Math.min(v, n - 1 - v) / mid : 1;
}

/** Ring stones of one span. `virtualSpan` numbers the span (arcade copies continue past the real ones). */
export function ringStones(ctx: Ctx, span: SpanGeometry, virtualSpan: number, arcade: boolean, dx = 0): void {
  const { half, out } = ctx;
  // Voussoirs are deep-bedded and long; the medium preset cuts them longer still.
  const nominal = Math.min(1.3, Math.max(0.7, ctx.blockLength * 1.6)) * (ctx.split === 1 ? 1.7 : 1);
  span.voussoirs.forEach((v, vi) => {
    const poly: Vec2[] = v.outline.map((p) => ({ x: p.x + dx, y: p.y }));
    const area = Math.abs(signedArea(poly));
    const c = centroid(poly);
    const cuts = v.keystone || ctx.split === 0 ? [-half, half] : splitRange(-half, half, nominal, vi % 2 === 0 ? 0 : 0.5, ctx.rng);
    const depth = halfDepth(span, vi);
    for (let k = 0; k < cuts.length - 1; k++) {
      const z0 = cuts[k]!;
      const z1 = cuts[k + 1]!;
      out.push({
        kind: v.keystone ? 'keystone' : 'voussoir',
        shape: { plane: 'xy', poly, w0: z0, w1: z1 },
        span: virtualSpan,
        voussoir: vi,
        pier: -1,
        follow: [virtualSpan, vi],
        followPier: -1,
        pivot: { x: c.x, y: c.y, z: (z0 + z1) / 2 },
        volume: area * (z1 - z0),
        // From both springings towards the crown; upstream stones of a course first.
        order: depth + (vi > (span.voussoirs.length - 1) / 2 ? 0.0004 : 0) + (half - z1) * 1e-5,
        material: 0,
        arcade,
      });
    }
  });
}

/** The arched voids through the spandrels: a ring of voussoirs, jambs and a sill through the fill. */
export function reliefStones(ctx: Ctx): void {
  const { g, half, out } = ctx;
  for (const r of g.reliefs) {
    const rad = r.width / 2;
    const outer = rad + RELIEF_RING;
    const springY = r.sill + r.height - rad;
    const count = 7;
    for (let i = 0; i < count; i++) {
      const a0 = Math.PI - (Math.PI * i) / count;
      const a1 = Math.PI - (Math.PI * (i + 1)) / count;
      const poly: Vec2[] = [];
      const steps = 3;
      for (let s = 0; s <= steps; s++) {
        const a = a0 + ((a1 - a0) * s) / steps;
        poly.push({ x: r.x + Math.cos(a) * rad, y: springY + Math.sin(a) * rad });
      }
      for (let s = steps; s >= 0; s--) {
        const a = a0 + ((a1 - a0) * s) / steps;
        poly.push({ x: r.x + Math.cos(a) * outer, y: springY + Math.sin(a) * outer });
      }
      const c = centroid(poly);
      const area = Math.abs(signedArea(poly));
      const cuts = ctx.split === 0 ? [-half, half] : splitRange(-half, half, 1.2, i % 2 === 0 ? 0 : 0.5, ctx.rng);
      for (let k = 0; k < cuts.length - 1; k++) {
        const z0 = cuts[k]!;
        const z1 = cuts[k + 1]!;
        out.push(wallSpec('relief', { plane: 'xy', poly, w0: z0, w1: z1 }, c, (z0 + z1) / 2, area * (z1 - z0), springY));
      }
    }
    // Jambs and sill run through the fill only: the face walls already form them at the faces.
    const inner = half - 0.5;
    if (inner <= 0.05) continue;
    const jamb = 0.3;
    // In courses and staggered lengths, like the walls: a single long block would read as a slab.
    const course = (poly: (y0: number, y1: number) => Vec2[], y0: number, y1: number): void => {
      let y = y0;
      let row = 0;
      while (y < y1 - 0.02) {
        const top = Math.min(y1, y + ctx.blockHeight);
        const zs = splitRange(-inner, inner, ctx.blockLength * 1.5, row % 2 === 0 ? 0 : 0.5, ctx.rng);
        const shape = poly(y, top);
        const c = centroid(shape);
        for (let k = 0; k < zs.length - 1; k++) {
          out.push(wallSpec('relief', { plane: 'xy', poly: shape, w0: zs[k]!, w1: zs[k + 1]! }, c, (zs[k]! + zs[k + 1]!) / 2, Math.abs(signedArea(shape)) * (zs[k + 1]! - zs[k]!), y));
        }
        y = top;
        row++;
      }
    };
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? r.x - rad - jamb : r.x + rad;
      course((y0, y1) => [
        { x: x0, y: y0 },
        { x: x0 + jamb, y: y0 },
        { x: x0 + jamb, y: y1 },
        { x: x0, y: y1 },
      ], r.sill, springY);
    }
    course((y0, y1) => [
      { x: r.x - rad, y: y0 },
      { x: r.x + rad, y: y0 },
      { x: r.x + rad, y: y1 },
      { x: r.x - rad, y: y1 },
    ], r.sill - 0.25, r.sill);
  }
}

function wallSpec(kind: StoneSpec['kind'], shape: StoneSpec['shape'], c: Vec2, z: number, volume: number, orderY: number): StoneSpec {
  return {
    kind,
    shape,
    span: -1,
    voussoir: -1,
    pier: -1,
    follow: [-1, -1],
    followPier: -1,
    pivot: { x: c.x, y: c.y, z },
    volume,
    order: orderY,
    material: 0,
    arcade: false,
  };
}
