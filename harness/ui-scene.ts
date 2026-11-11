/**
 * A painted stand-in for the 3D scene, so the interface can be judged over a picture: sky, far
 * hills, the valley from the level's ground line, water and the bridge (pale draft or stone).
 * Drawn through the same fake projector the interface uses.
 */
import type { Projector } from '../src/core/contracts';
import type { Vec2 } from '../src/core/types';
import { arches, deckFor, groundFor, piersFor, type BridgeSpec } from './ui-samples';

export interface SceneOptions {
  readonly spec: BridgeSpec;
  readonly look: 'draft' | 'stone' | 'none';
  /** 0 bright day .. 1 evening. */
  readonly evening: number;
  readonly water: number;
}

/** Elevation-to-screen mapping that frames the bridge like the long-lens design camera. */
export function fitProjector(spec: BridgeSpec, width: number, height: number, zoom = 1): Projector & { scale: number } {
  const left = spec.spans[0]!.left;
  const right = spec.spans[spec.spans.length - 1]!.right;
  const span = right - left + 10;
  const scale = Math.min((width * 0.7) / span, (height * 0.5) / 11) * zoom;
  const mx = (left + right) / 2;
  const my = 3.2;
  const cx = width / 2;
  const cy = height * 0.53;
  return {
    scale,
    toScreen(p: Vec2, out?: Vec2): Vec2 {
      const o = out ?? { x: 0, y: 0 };
      o.x = cx + (p.x - mx) * scale;
      o.y = cy - (p.y - my) * scale;
      return o;
    },
    fromScreen(x: number, y: number): Vec2 | null {
      return { x: mx + (x - cx) / scale, y: my - (y - cy) / scale };
    },
  };
}

function poly(ctx: CanvasRenderingContext2D, pts: readonly Vec2[], P: Projector): void {
  pts.forEach((p, i) => {
    const q = P.toScreen(p);
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
}

export function paintScene(canvas: HTMLCanvasElement, P: Projector, opts: SceneOptions): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const e = opts.evening;

  // Sky: cool zenith to a warm, hazy horizon.
  const horizon = P.toScreen({ x: 0, y: 9 }).y;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, e > 0.5 ? '#46526a' : '#7f97a8');
  sky.addColorStop(0.7, e > 0.5 ? '#b98a6c' : '#c9cfc9');
  sky.addColorStop(1, e > 0.5 ? '#e0b48a' : '#e6dfcf');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const sun = ctx.createRadialGradient(w * 0.22, horizon - h * 0.12, 0, w * 0.22, horizon - h * 0.12, h * 0.5);
  sun.addColorStop(0, 'rgba(255,240,210,0.55)');
  sun.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);

  // Far hills in two hazy layers.
  const hill = (base: number, amp: number, freq: number, phase: number, color: string): void => {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const y = base - amp * (0.55 * Math.sin(x * freq + phase) + 0.3 * Math.sin(x * freq * 2.7 + phase * 2) + 0.15 * Math.sin(x * freq * 6.1));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  hill(horizon - 10, h * 0.07, 0.006, 1.2, 'rgba(120,128,128,0.55)');
  hill(horizon + 8, h * 0.05, 0.009, 4.1, 'rgba(98,100,88,0.75)');

  if (opts.look !== 'none') paintBridge(ctx, P, opts);
  paintGround(ctx, P, opts, h, horizon);
}

function paintGround(ctx: CanvasRenderingContext2D, P: Projector, opts: SceneOptions, h: number, horizon: number): void {
  // Valley ground.
  const ground = groundFor(opts.spec);
  ctx.beginPath();
  poly(ctx, ground, P);
  const last = P.toScreen(ground[ground.length - 1]!);
  const first = P.toScreen(ground[0]!);
  ctx.lineTo(last.x, h + 10);
  ctx.lineTo(first.x, h + 10);
  ctx.closePath();
  const soil = ctx.createLinearGradient(0, horizon, 0, h);
  soil.addColorStop(0, '#7b6f55');
  soil.addColorStop(1, '#3f3a2e');
  ctx.fillStyle = soil;
  ctx.fill();

  // Water, from the bed to the surface, with a pale skin of reflected sky.
  const left = opts.spec.spans[0]!.left;
  const right = opts.spec.spans[opts.spec.spans.length - 1]!.right;
  const a = P.toScreen({ x: left - 2, y: opts.water });
  const b = P.toScreen({ x: right + 2, y: -1.6 });
  const water = ctx.createLinearGradient(0, a.y, 0, b.y);
  water.addColorStop(0, 'rgba(150,140,118,0.95)');
  water.addColorStop(1, 'rgba(88,76,58,0.98)');
  ctx.fillStyle = water;
  // Water lies above the ground and below the surface: clip to the open air over the ground line.
  ctx.save();
  ctx.beginPath();
  poly(ctx, ground, P);
  ctx.lineTo(last.x, -10);
  ctx.lineTo(first.x, -10);
  ctx.closePath();
  ctx.clip();
  ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y + 4);
  ctx.restore();

}

function paintBridge(ctx: CanvasRenderingContext2D, P: Projector, opts: SceneOptions): void {
  const draft = opts.look === 'draft';
  const fill = draft ? 'rgba(232,226,212,0.42)' : '#a69e90';
  const shade = draft ? 'rgba(232,226,212,0.28)' : '#8f8778';
  const all = arches(opts.spec);
  const deck = deckFor(opts.spec);
  // Spandrels and deck as one mass, with the arch openings cut out.
  ctx.beginPath();
  poly(ctx, [{ x: deck[0]!.x, y: opts.spec.spring - 0.3 }, ...deck, { x: deck[deck.length - 1]!.x, y: opts.spec.spring - 0.3 }], P);
  ctx.closePath();
  for (const ar of all) {
    poly(ctx, [...ar.intrados].reverse(), P);
    ctx.closePath();
  }
  ctx.fillStyle = shade;
  ctx.fill('evenodd');
  for (const ar of all) {
    ctx.beginPath();
    poly(ctx, [...ar.extrados, ...[...ar.intrados].reverse()], P);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  for (const p of piersFor(opts.spec)) {
    const q0 = P.toScreen({ x: p.x - p.width / 2, y: p.top });
    const q1 = P.toScreen({ x: p.x + p.width / 2, y: -1.5 });
    ctx.fillStyle = shade;
    ctx.fillRect(q0.x, q0.y, q1.x - q0.x, q1.y - q0.y);
  }
}
