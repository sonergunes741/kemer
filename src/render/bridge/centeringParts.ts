/**
 * Where every timber of the centering goes: ribs, lagging, tie beams on folding wedges, posts,
 * struts and braces under each span, and the hoist over the main one. Kept apart from
 * centering.ts, which only moves these pieces, so the carpentry can be read on its own.
 */
import { Vector3, type Quaternion } from 'three';
import type { Vec2 } from '../../core/types';
import type { BridgeFrame, SpanFrame } from './frame';
import { between, type Piece, type TimberKind } from './timber';

const LAG = 0.05;
const RIB = 0.22;
const WEDGE_H = 0.15;

type Placed = { pos: Vector3; quat: Quaternion; size: Vector3 };
type Push = (kind: TimberKind, p: Placed) => number;

export interface SpanParts {
  readonly index: number;
  /** Top of the tie beam: the timber hangs from here when it falls. */
  readonly yTie: number;
  readonly pieces: number[];
}

export interface HoistParts {
  /** Every hoist piece, block and rope included. */
  readonly pieces: number[];
  readonly block: number;
  readonly rope: number;
  readonly top: number;
  readonly x: number;
  readonly range: [number, number];
}

export interface CenteringParts {
  readonly pieces: Piece[];
  /** The three wedges the player strikes, in their own list so they can glow. */
  readonly glow: Piece[];
  /** The other ribs' wedges at each of the three main stations: they go with the struck one. */
  readonly companions: number[][];
  /** In the order of the spans given. */
  readonly spans: SpanParts[];
  readonly hoist: HoistParts | null;
}

export function centeringParts(spans: readonly SpanFrame[], frame: BridgeFrame, width: number, main: number): CenteringParts {
  const pieces: Piece[] = [];
  const glow: Piece[] = [];
  const companions: number[][] = [[], [], []];
  const h = width / 2;
  const ribs = Math.max(2, Math.ceil(width / 1.5));
  const zs = Array.from({ length: ribs }, (_, r) => -h + 0.35 + ((width - 0.7) * r) / (ribs - 1));
  const out: SpanParts[] = [];
  for (const sf of spans) {
    const part: SpanParts = { index: sf.index, yTie: sf.geo.left.y - 0.2, pieces: [] };
    const push: Push = (kind, p) => {
      pieces.push({ span: sf.index, kind, ...p });
      part.pieces.push(pieces.length - 1);
      return pieces.length - 1;
    };
    const lit = sf.index === main ? (p: Placed): void => void glow.push({ span: sf.index, kind: 'wedge', ...p }) : null;
    spanPieces(sf, frame, zs, h, part.yTie, push, lit, companions);
    out.push(part);
  }
  const mainFrame = spans.find((s) => s.index === main);
  const hoist = mainFrame
    ? hoistParts(mainFrame, h, (kind, p) => {
        pieces.push({ span: main, kind, ...p });
        return pieces.length - 1;
      })
    : null;
  return { pieces, glow, companions, spans: out, hoist };
}

/** Unit normal of a left-to-right intrados polyline at point i, pointing into the opening. */
function inward(line: readonly Vec2[], i: number): Vec2 {
  const a = line[Math.max(0, i - 1)]!;
  const b = line[Math.min(line.length - 1, i + 1)]!;
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.y - a.y) / l, y: -(b.x - a.x) / l };
}

/** Points every `step` metres of arc along a polyline. */
function everyMetres(line: readonly Vec2[], step: number): Vec2[] {
  const out: Vec2[] = [];
  let next = step / 2;
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    while (next <= walked + len) {
      const t = (next - walked) / Math.max(1e-9, len);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      next += step;
    }
    walked += len;
  }
  return out;
}

function spanPieces(sf: SpanFrame, frame: BridgeFrame, zs: readonly number[], h: number, yTie: number, push: Push, glow: ((p: Placed) => void) | null, companions: number[][]): void {
  const s = sf.geo;
  const line = s.intrados;
  // Ribs: chords a little inside the intrados, under the lagging.
  const steps = Math.max(6, Math.min(24, Math.round(s.span / 0.9)));
  const at = (k: number): Vector3 => {
    const i = Math.round((k * (line.length - 1)) / steps);
    const n = inward(line, i);
    const p = line[i]!;
    return new Vector3(p.x + n.x * (LAG + RIB / 2), p.y + n.y * (LAG + RIB / 2), 0);
  };
  for (const z of zs) {
    for (let k = 0; k < steps; k++) push('rib', between(at(k).setZ(z), at(k + 1).setZ(z), RIB, 0.14));
  }
  // Lagging planks across the width, every 0.3 m of arc: the stones bed on these.
  const lags = everyMetres(line, 0.3);
  for (let i = 0; i < lags.length; i++) {
    const p = lags[i]!;
    const o = lags[Math.max(0, i - 1)]!;
    const q = lags[Math.min(lags.length - 1, i + 1)]!;
    const t = new Vector3(q.x - o.x, q.y - o.y, 0).normalize();
    const c = new Vector3(p.x + (t.y * LAG) / 2, p.y - (t.x * LAG) / 2, 0);
    push('lag', between(c.clone().setZ(-h - 0.12), c.clone().setZ(h + 0.12), LAG, 0.19, t));
  }
  // Tie beam, wedges and posts at three stations; struts up to the ribs; braces between posts.
  const xs = [s.left.x + s.span * 0.17, s.crown.x, s.right.x - s.span * 0.17];
  const ribBottom = (x: number): number => {
    let best = line[0]!;
    for (const p of line) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    return best.y - LAG - RIB;
  };
  const top = yTie - 0.12;
  zs.forEach((z, zi) => {
    push('tie', between(new Vector3(s.left.x + 0.05, yTie, z), new Vector3(s.right.x - 0.05, yTie, z), 0.24, 0.16));
    xs.forEach((x, xi) => {
      const wedge = between(new Vector3(x - 0.24, top - WEDGE_H / 2, z), new Vector3(x + 0.24, top - WEDGE_H / 2, z), WEDGE_H, 0.18);
      // The three wedges the player strikes are on the upstream rib, the one the camera sees.
      if (glow && zi === zs.length - 1) glow(wedge);
      else {
        const wi = push('wedge', wedge);
        if (glow) companions[xi]!.push(wi);
      }
      const foot = frame.ground.at(x) - 0.3;
      const postTop = top - WEDGE_H;
      if (postTop - foot > 0.35) push('post', between(new Vector3(x, foot, z), new Vector3(x, postTop, z), 0.2, 0.2, new Vector3(1, 0, 0)));
      const rb = ribBottom(x);
      if (rb - yTie > 0.4) push('strut', between(new Vector3(x, yTie + 0.1, z), new Vector3(x, rb, z), 0.16, 0.14, new Vector3(1, 0, 0)));
    });
    for (let k = 0; k < xs.length - 1; k++) {
      const xa = xs[k]!;
      const xb = xs[k + 1]!;
      const xm = (xa + xb) / 2;
      const rb = ribBottom(xm);
      if (rb - yTie > 0.5) {
        push('strut', between(new Vector3(xa, yTie + 0.1, z), new Vector3(xm, rb, z), 0.14, 0.12));
        push('strut', between(new Vector3(xb, yTie + 0.1, z), new Vector3(xm, rb, z), 0.14, 0.12));
      }
      const fa = frame.ground.at(xa) + 0.1;
      const fb = frame.ground.at(xb) + 0.1;
      // Cross-bracing on the outer frames only: enough to read as braced, not a thicket.
      const outer = zi === 0 || zi === zs.length - 1;
      if (outer && yTie - Math.max(fa, fb) > 1.3) {
        push('brace', between(new Vector3(xa, fa, z), new Vector3(xb, yTie - 0.35, z), 0.12, 0.1));
        push('brace', between(new Vector3(xb, fb, z), new Vector3(xa, yTie - 0.35, z), 0.12, 0.1));
      }
    }
  });
}

/** A beam over the crown on two A-frames standing on the ring, with a block and a rope. */
function hoistParts(sf: SpanFrame, h: number, add: Push): HoistParts {
  const s = sf.geo;
  const yH = sf.ext.at(s.crown.x) + 3.2;
  const reach = Math.min(2.6, s.span * 0.3 + 0.8);
  const x0 = s.crown.x - reach;
  const x1 = s.crown.x + reach;
  const pieces = [add('hoist', between(new Vector3(x0 - 0.2, yH, 0), new Vector3(x1 + 0.2, yH, 0), 0.24, 0.2))];
  for (const x of [x0, x1]) {
    for (const z of [-h + 0.15, h - 0.15]) {
      pieces.push(add('hoist', between(new Vector3(x, sf.ext.at(x), z), new Vector3(x, yH + 0.1, 0), 0.16, 0.16, new Vector3(1, 0, 0))));
    }
  }
  const block = add('hoist', between(new Vector3(-0.15, 0, 0), new Vector3(0.15, 0, 0), 0.3, 0.22));
  const rope = add('rope', between(new Vector3(0, -0.5, 0), new Vector3(0, 0.5, 0), 0.035, 0.035, new Vector3(1, 0, 0)));
  pieces.push(block, rope);
  return { pieces, block, rope, top: yH, x: s.crown.x, range: [x0 + 0.3, x1 - 0.3] };
}
