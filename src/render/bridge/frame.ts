/**
 * The bridge read as functions of x: deck and ground lines, each ring's back, the springing
 * joints, and the solid wall a face would have at x once the rings, openings and pier shells are
 * cut out of it. The wall layout and the "which ring is under this stone" questions use it.
 */
import type { BridgeGeometry, PierGeometry, ReliefGeometry, SpanGeometry, Vec2 } from '../../core/types';
import { Profile, lineAt } from './poly';
import { RELIEF_RING } from './layoutRing';

/** Paving thickness: the walls stop this far under the road surface. */
export const PAVE = 0.2;
/** How deep the walls are bedded below the ground at the abutments. */
const EMBED = 0.5;

export interface SpanFrame {
  readonly geo: SpanGeometry;
  readonly index: number;
  readonly ext: Profile;
  readonly j0a: Vec2;
  readonly j0b: Vec2;
  readonly jNa: Vec2;
  readonly jNb: Vec2;
  /** x of each joint's extrados end, ascending: voussoir i lies between xs[i] and xs[i + 1]. */
  readonly xs: Float64Array;
  readonly arcade: boolean;
}

export type Interval = [number, number];

export class BridgeFrame {
  readonly deck: Profile;
  readonly ground: Profile;
  readonly spans: SpanFrame[];
  readonly x0: number;
  readonly x1: number;

  constructor(
    readonly g: BridgeGeometry,
    groundLine: readonly Vec2[],
    readonly piers: readonly PierGeometry[],
    spans: readonly { geo: SpanGeometry; index: number; arcade: boolean }[],
    deck: readonly Vec2[],
    readonly reliefs: readonly ReliefGeometry[],
  ) {
    this.deck = new Profile(deck);
    this.ground = new Profile(groundLine);
    this.x0 = deck[0]?.x ?? 0;
    this.x1 = deck[deck.length - 1]?.x ?? 0;
    this.spans = spans.map(({ geo, index, arcade }) => {
      const n = geo.joints.length - 1;
      const pts = [...geo.extrados, geo.joints[0]!.b, geo.joints[n]!.b];
      return {
        geo,
        index,
        ext: new Profile(pts),
        j0a: geo.joints[0]!.a,
        j0b: geo.joints[0]!.b,
        jNa: geo.joints[n]!.a,
        jNb: geo.joints[n]!.b,
        xs: new Float64Array(geo.joints.map((j) => j.b.x)),
        arcade,
      };
    });
  }

  /** Top of the walls under the paving. */
  wallTop(x: number): number {
    return this.deck.at(x) - PAVE;
  }

  /** The part of span s's ring (and the opening under it) at x, or null. */
  ringAt(s: SpanFrame, x: number): Interval | null {
    const lo = Math.min(s.j0b.x, s.j0a.x);
    const hi = Math.max(s.jNb.x, s.jNa.x);
    if (x < lo || x > hi) return null;
    const top = s.ext.at(x);
    let bottom = -Infinity;
    if (x < s.j0a.x) bottom = lineAt(s.j0a, s.j0b, x);
    else if (x > s.jNa.x) bottom = lineAt(s.jNa, s.jNb, x);
    return [bottom, top];
  }

  private reliefAt(r: ReliefGeometry, x: number): Interval | null {
    const rad = r.width / 2;
    const outer = rad + RELIEF_RING;
    const springY = r.sill + r.height - rad;
    const dx = Math.abs(x - r.x);
    if (dx > outer) return null;
    const top = springY + Math.sqrt(Math.max(0, outer * outer - dx * dx));
    return [dx <= rad ? r.sill : springY, top];
  }

  /** Solid face wall at x: from the bedded foot up to the road, minus rings, openings, piers and reliefs. */
  solidAt(x: number): Interval[] {
    const top = this.wallTop(x);
    const base = this.ground.at(x) - EMBED;
    let parts: Interval[] = base < top ? [[base, top]] : [];
    const cut = (a: number, b: number): void => {
      const next: Interval[] = [];
      for (const [lo, hi] of parts) {
        if (b <= lo || a >= hi) next.push([lo, hi]);
        else {
          if (a > lo) next.push([lo, a]);
          if (b < hi) next.push([b, hi]);
        }
      }
      parts = next;
    };
    for (const s of this.spans) {
      const r = this.ringAt(s, x);
      if (r) cut(r[0], r[1]);
    }
    for (const p of this.piers) {
      if (Math.abs(x - p.x) <= p.width / 2) cut(-Infinity, p.top);
    }
    for (const r of this.reliefs) {
      const o = this.reliefAt(r, x);
      if (o) cut(o[0], o[1]);
    }
    return parts;
  }

  /** The ring course a point rests on: [span index, voussoir], or null when it stands on a support. */
  ringUnder(x: number, y: number): [number, number] | null {
    for (const s of this.spans) {
      const r = this.ringAt(s, x);
      if (!r) continue;
      if (y < r[0]) return null; // under a springing joint: part of the support
      const xs = s.xs;
      let lo = 0;
      let hi = xs.length - 1;
      if (x <= xs[0]!) return [s.index, 0];
      if (x >= xs[hi]!) return [s.index, hi - 1];
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (xs[mid]! <= x) lo = mid;
        else hi = mid;
      }
      return [s.index, lo];
    }
    return null;
  }

  /** Pier whose top (or shell) is under x, or -1. */
  pierUnder(x: number): number {
    for (const p of this.piers) {
      if (Math.abs(x - p.x) <= p.width / 2 + 0.6) return p.index;
    }
    return -1;
  }
}
