/**
 * Line drawings of a bridge in elevation, for the ledger rows and the "Neden?" diagram. Shapes
 * come either from finished geometry (ledger) or from the last design model (collapse). The fit
 * and path maths are pure; drawing appends SVG paths.
 */
import type { DesignModel } from '../core/contracts';
import type { BridgeGeometry, Vec2 } from '../core/types';
import { s } from './dom';

export interface SketchShape {
  readonly rings: readonly { readonly intrados: readonly Vec2[]; readonly extrados: readonly Vec2[] }[];
  readonly piers: readonly { readonly x: number; readonly width: number; readonly top: number; readonly base: number }[];
  readonly deck: readonly Vec2[];
}

export function shapeFromGeometry(g: BridgeGeometry): SketchShape {
  return {
    rings: g.spans.map((sp) => ({ intrados: sp.intrados, extrados: sp.extrados })),
    // The ledger draws piers down to the bed: foundations underground would only add noise.
    piers: g.piers.map((p) => ({ x: p.x, width: p.width, top: p.top, base: p.bed })),
    deck: g.deck,
  };
}

export function shapeFromModel(m: DesignModel): SketchShape {
  return {
    rings: m.spans.map((sp) => ({ intrados: sp.intrados, extrados: sp.extrados })),
    piers: m.piers.map((p) => ({ x: p.x, width: p.width, top: p.top, base: p.base })),
    deck: m.deck,
  };
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function shapeBounds(shape: SketchShape): Bounds | null {
  const b: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const add = (p: Vec2): void => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    b.minX = Math.min(b.minX, p.x);
    b.maxX = Math.max(b.maxX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxY = Math.max(b.maxY, p.y);
  };
  for (const r of shape.rings) {
    r.intrados.forEach(add);
    r.extrados.forEach(add);
  }
  for (const p of shape.piers) {
    add({ x: p.x - p.width / 2, y: p.base });
    add({ x: p.x + p.width / 2, y: p.top });
  }
  shape.deck.forEach(add);
  return Number.isFinite(b.minX) && b.maxX > b.minX ? b : null;
}

export interface Fit {
  readonly scale: number;
  readonly ox: number;
  readonly oy: number;
}

/** Uniform scale fitting the bounds into w x h with padding, y flipped (SVG y runs down). */
export function fitBounds(b: Bounds, w: number, h: number, pad: number): Fit {
  const bw = Math.max(1e-6, b.maxX - b.minX);
  const bh = Math.max(1e-6, b.maxY - b.minY);
  const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  const ox = (w - bw * scale) / 2 - b.minX * scale;
  const oy = (h + bh * scale) / 2 + b.minY * scale;
  return { scale, ox, oy };
}

export function project(p: Vec2, f: Fit): { x: number; y: number } {
  return { x: f.ox + p.x * f.scale, y: f.oy - p.y * f.scale };
}

export function polyPath(points: readonly Vec2[], f: Fit, close = false): string {
  let d = '';
  for (let i = 0; i < points.length; i++) {
    const q = project(points[i]!, f);
    d += `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
  }
  return close && d ? `${d}Z` : d;
}

/** Ring outline (extrados out, intrados back) as one closed path. */
export function ringPath(intrados: readonly Vec2[], extrados: readonly Vec2[], f: Fit): string {
  const pts = [...extrados, ...[...intrados].reverse()];
  return polyPath(pts, f, true);
}

/** Draw the shape into an SVG group; returns the fit so callers can add marks on top. */
export function drawSketch(group: SVGGElement, shape: SketchShape, w: number, h: number, pad: number, extra: readonly Vec2[] = []): Fit | null {
  const b0 = shapeBounds(shape);
  if (!b0) return null;
  const b = { ...b0 };
  for (const p of extra) {
    b.minY = Math.min(b.minY, p.y);
    b.maxY = Math.max(b.maxY, p.y);
  }
  const f = fitBounds(b, w, h, pad);
  for (const p of shape.piers) {
    const x0 = p.x - p.width / 2;
    const x1 = p.x + p.width / 2;
    const d = polyPath(
      [
        { x: x0, y: p.top },
        { x: x0, y: p.base },
        { x: x1, y: p.base },
        { x: x1, y: p.top },
      ],
      f,
    );
    group.appendChild(s('path', { d }, 'k-sketch__pier'));
  }
  for (const r of shape.rings) group.appendChild(s('path', { d: ringPath(r.intrados, r.extrados, f) }, 'k-sketch__ring'));
  if (shape.deck.length > 1) group.appendChild(s('path', { d: polyPath(shape.deck, f) }, 'k-sketch__deck'));
  return f;
}
