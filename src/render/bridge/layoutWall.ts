/**
 * The face walls (spandrels and abutments) in horizontal courses cut cleanly against the backs of
 * the rings, the relief openings and the deck line; then parapets, coping and the cobbled road.
 */
import type { Rng } from '../../core/rng';
import type { Vec2 } from '../../core/types';
import { BridgeFrame, PAVE, type Interval } from './frame';
import { splitRange } from './layoutRing';
import { centroid, signedArea } from './poly';
import type { StoneKind, StoneSpec } from './types';

/** Thickness of a spandrel face wall; the rubble fill behind it is not modelled. */
export const FACE = 0.5;
export const PARAPET_T = 0.32;
const COPING_H = 0.16;
const STEP = 0.04;

interface Sample {
  x: number;
  lo: number;
  hi: number;
}

export interface WallCtx {
  readonly frame: BridgeFrame;
  readonly half: number;
  readonly springLevel: number;
  readonly blockLength: number;
  readonly blockHeight: number;
  readonly rng: Rng;
  readonly out: StoneSpec[];
  readonly parapetHeight: number;
}

function clipBand(parts: readonly Interval[], y0: number, y1: number): Interval[] {
  const out: Interval[] = [];
  for (const [lo, hi] of parts) {
    const a = Math.max(lo, y0);
    const b = Math.min(hi, y1);
    if (b - a > 0.025) out.push([a, b]);
  }
  return out;
}

/** Course heights from the springing line up and down: every course a little different. */
function courses(ctx: WallCtx, bottom: number, top: number): number[] {
  const h = ctx.blockHeight;
  const ys = [ctx.springLevel];
  let y = ctx.springLevel;
  while (y < top) {
    y += h * ctx.rng.range(0.9, 1.2);
    ys.push(y);
  }
  y = ctx.springLevel;
  while (y > bottom) {
    y -= h * ctx.rng.range(1.0, 1.35);
    ys.unshift(y);
  }
  return ys;
}

function stoneFromRun(run: readonly Sample[], i0: number, i1: number): Vec2[] {
  const poly: Vec2[] = [];
  for (let i = i0; i <= i1; i++) poly.push({ x: run[i]!.x, y: run[i]!.lo });
  for (let i = i1; i >= i0; i--) poly.push({ x: run[i]!.x, y: run[i]!.hi });
  return poly;
}

function push(ctx: WallCtx, kind: StoneKind, poly: Vec2[], z0: number, z1: number, order: number, material: 0 | 1 = 0): void {
  const area = Math.abs(signedArea(poly));
  if (area < 0.004) return;
  const c = centroid(poly);
  const ring = ctx.frame.ringUnder(c.x, c.y);
  ctx.out.push({
    kind,
    shape: { plane: 'xy', poly, w0: z0, w1: z1 },
    span: ring ? ring[0] : -1,
    voussoir: -1,
    pier: -1,
    follow: ring ?? [-1, -1],
    followPier: ring ? -1 : ctx.frame.pierUnder(c.x),
    pivot: { x: c.x, y: c.y, z: (z0 + z1) / 2 },
    volume: area * (z1 - z0),
    order,
    material,
    arcade: false,
  });
}

/** Both face walls, course by course. */
export function faceWalls(ctx: WallCtx): void {
  const f = ctx.frame;
  const n = Math.max(2, Math.ceil((f.x1 - f.x0) / STEP));
  const solid: Interval[][] = [];
  const xs: number[] = [];
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i <= n; i++) {
    const x = f.x0 + ((f.x1 - f.x0) * i) / n;
    const parts = f.solidAt(x);
    xs.push(x);
    solid.push(parts);
    for (const [a, b] of parts) {
      low = Math.min(low, a);
      high = Math.max(high, b);
    }
  }
  if (!Number.isFinite(low)) return;
  const ys = courses(ctx, low, high);
  const nominal = ctx.blockLength * 1.45;
  for (const face of [1, -1]) {
    const z0 = face > 0 ? ctx.half - FACE : -ctx.half;
    const z1 = face > 0 ? ctx.half : -ctx.half + FACE;
    for (let k = 0; k < ys.length - 1; k++) {
      const y0 = ys[k]!;
      const y1 = ys[k + 1]!;
      // Runs of constant topology: a stone never spans a change in how many pieces the band has.
      let runs: Sample[][] = [];
      const flush = (): void => {
        for (const run of runs) cutRun(ctx, run, z0, z1, nominal, k % 2 === 0 ? 0.5 : 0, y0);
        runs = [];
      };
      for (let i = 0; i < xs.length; i++) {
        const parts = clipBand(solid[i]!, y0, y1);
        const ok =
          parts.length === runs.length &&
          parts.every((p, j) => {
            const last = runs[j]![runs[j]!.length - 1]!;
            return Math.abs(p[0] - last.lo) < 0.25 && Math.abs(p[1] - last.hi) < 0.25;
          });
        if (!ok) {
          flush();
          runs = parts.map(() => []);
        }
        parts.forEach((p, j) => runs[j]!.push({ x: xs[i]!, lo: p[0], hi: p[1] }));
      }
      flush();
    }
  }
}

function cutRun(ctx: WallCtx, run: Sample[], z0: number, z1: number, nominal: number, phase: number, y0: number): void {
  if (run.length < 2) return;
  let tallest = 0;
  for (const s of run) tallest = Math.max(tallest, s.hi - s.lo);
  if (tallest < 0.04) return;
  const xa = run[0]!.x;
  const xb = run[run.length - 1]!.x;
  const cuts = splitRange(xa, xb, nominal, phase, ctx.rng);
  let i0 = 0;
  for (let c = 1; c < cuts.length; c++) {
    let i1 = i0;
    while (i1 < run.length - 1 && run[i1 + 1]!.x <= cuts[c]! + 1e-9) i1++;
    if (c === cuts.length - 1) i1 = run.length - 1;
    if (i1 > i0) {
      const poly = stoneFromRun(run, i0, i1);
      const kind: StoneKind = ctx.frame.ringUnder((run[i0]!.x + run[i1]!.x) / 2, y0 + 0.05) ? 'spandrel' : 'abutment';
      push(ctx, kind, poly, z0, z1, y0 + (run[i0]!.x - ctx.frame.x0) * 0.002);
    }
    i0 = i1;
  }
}

/** Samples of the deck line between x0 and x1 (both ends and every kink in between). */
function deckPoints(ctx: WallCtx, x0: number, x1: number): number[] {
  const out = [x0];
  for (const p of ctx.frame.g.deck) if (p.x > x0 + 0.02 && p.x < x1 - 0.02) out.push(p.x);
  out.push(x1);
  return out;
}

/** A strip of the deck line between x0 and x1, from `below` to `above` metres relative to the road. */
function deckStrip(ctx: WallCtx, x0: number, x1: number, below: number, above: number): Vec2[] {
  const xs = deckPoints(ctx, x0, x1);
  const poly: Vec2[] = xs.map((x) => ({ x, y: ctx.frame.deck.at(x) + below }));
  for (let i = xs.length - 1; i >= 0; i--) poly.push({ x: xs[i]!, y: ctx.frame.deck.at(xs[i]!) + above });
  return poly;
}

/** Parapets in two raking courses, the coping on top, and the cobbled road between them. */
export function deckStones(ctx: WallCtx): void {
  const f = ctx.frame;
  const h = ctx.half;
  const ph = ctx.parapetHeight;
  const body = ph - COPING_H + PAVE;
  for (const face of [1, -1]) {
    const z0 = face > 0 ? h - PARAPET_T : -h;
    const z1 = face > 0 ? h : -h + PARAPET_T;
    const rows = 2;
    for (let r = 0; r < rows; r++) {
      const below = -PAVE + (body * r) / rows;
      const above = -PAVE + (body * (r + 1)) / rows;
      const cuts = splitRange(f.x0, f.x1, ctx.blockLength * 1.6, r % 2 === 0 ? 0 : 0.5, ctx.rng);
      for (let c = 0; c < cuts.length - 1; c++) {
        push(ctx, 'parapet', deckStrip(ctx, cuts[c]!, cuts[c + 1]!, below, above), z0, z1, 10 + r + c * 1e-3);
      }
    }
    // The coping stands a little proud of both faces of the parapet, for a clean shadow line.
    const cz0 = face > 0 ? h - PARAPET_T - 0.04 : -h - 0.04;
    const cz1 = face > 0 ? h + 0.04 : -h + PARAPET_T + 0.04;
    const cuts = splitRange(f.x0 - 0.04, f.x1 + 0.04, 1.15, 0.5, ctx.rng);
    for (let c = 0; c < cuts.length - 1; c++) {
      push(ctx, 'coping', deckStrip(ctx, cuts[c]!, cuts[c + 1]!, ph - COPING_H, ph), cz0, cz1, 20 + c * 1e-3);
    }
  }
  const cuts = splitRange(f.x0, f.x1, 1.6, 0, ctx.rng);
  for (let c = 0; c < cuts.length - 1; c++) {
    push(ctx, 'paving', deckStrip(ctx, cuts[c]!, cuts[c + 1]!, -PAVE, 0), -h + PARAPET_T, h - PARAPET_T, 30 + c * 1e-3, 1);
  }
}

/**
 * Where a road end stands above the bank, a wall closes the fill between the two faces (the
 * level's road is higher than its ground there, and the section must not show).
 */
export function endWalls(ctx: WallCtx): void {
  const f = ctx.frame;
  const inner = ctx.half - FACE;
  if (inner <= 0.05) return;
  for (const [x, dir] of [
    [f.x0, 1],
    [f.x1, -1],
  ] as const) {
    const top = f.wallTop(x);
    const foot = f.ground.at(x) - 0.4;
    if (top - foot < 0.6) continue;
    const xa = dir > 0 ? x : x - 0.5;
    const xb = dir > 0 ? x + 0.5 : x;
    let y = foot;
    let k = 0;
    while (y < top - 0.05) {
      const y1 = Math.min(top, y + ctx.blockHeight * ctx.rng.range(0.95, 1.2));
      const cuts = splitRange(-inner, inner, ctx.blockLength * 1.45, k % 2 === 0 ? 0 : 0.5, ctx.rng);
      for (let c = 0; c < cuts.length - 1; c++) {
        const poly: Vec2[] = [
          { x: cuts[c]!, y },
          { x: cuts[c + 1]!, y },
          { x: cuts[c + 1]!, y: y1 },
          { x: cuts[c]!, y: y1 },
        ];
        const area = Math.abs(signedArea(poly));
        ctx.out.push({
          kind: 'abutment',
          shape: { plane: 'zy', poly, w0: xa, w1: xb },
          span: -1,
          voussoir: -1,
          pier: -1,
          follow: [-1, -1],
          followPier: -1,
          pivot: { x: (xa + xb) / 2, y: (y + y1) / 2, z: (cuts[c]! + cuts[c + 1]!) / 2 },
          volume: area * 0.5,
          order: y,
          material: 0,
          arcade: false,
        });
      }
      y = y1;
      k++;
    }
  }
}
