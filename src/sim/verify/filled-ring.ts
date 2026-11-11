/**
 * Loads on a ring with fill, worked out from the public BridgeGeometry and the words of
 * SIM-SPEC sections 2 and 3 only: nothing here imports the simulation's own load code or tuning,
 * so the comparison in kinematic.test.ts also checks loads.ts, not just the LP.
 */
import type { BridgeGeometry, Vec2 } from '../../core/types';
import type { KinRing, Load, Pt } from './kinematic';
import { addLoad, polygonCentroid } from './kinematic';

/* SIM-SPEC 2 and 3, restated. */
const FILL_UNIT_WEIGHT = 18;
const SPANDREL_WALL = 0.5;
const PARAPET_WIDTH = 0.3;
const PARAPET_HEIGHT = 0.9;
const PAVING = 0.2;
const AXLE_WIDTH_BASE = 2.5;
const AXLE_LENGTH_BASE = 0.3;

/** Height of a left-to-right polyline at x (clamped at its ends). */
export function polylineAt(line: readonly Vec2[], x: number): number {
  const first = line[0]!;
  if (x <= first.x) return first.y;
  for (let i = 1; i < line.length; i++) {
    const p = line[i]!;
    if (x <= p.x) {
      const q = line[i - 1]!;
      return p.x > q.x ? q.y + ((p.y - q.y) * (x - q.x)) / (p.x - q.x) : Math.max(p.y, q.y);
    }
  }
  return line[line.length - 1]!.y;
}

export interface FilledRing {
  readonly a: Pt[];
  readonly b: Pt[];
  /** Vertical dead loads per course: stone, fill, paving and parapets. */
  readonly dead: Load[];
  /** The same weights applied horizontally (+x) at their true heights: a unit of g to the right. */
  readonly inertia: Load[];
  /** Total dead weight, kN per metre of width. */
  readonly weight: number;
  /** Depth of fill and paving over the back of the ring at x. */
  depthAt(x: number): number;
  /** A unit axle (1 kN, whole width) standing at x, as loads per course. */
  axle(x: number): Load[];
  /** The ring with that axle as the live load: the multiplier is the axle capacity in kN. */
  withAxle(x: number): KinRing;
  /** The ring with horizontal inertia as the live load (`dir` +1 to the right): multiplier in g. */
  withQuake(dir: 1 | -1): KinRing;
}

/**
 * Span `index` of a bridge as a loaded ring. Each course carries its own weight at the centroid of
 * its outline and the strip of fill, paving and parapet vertically above its extrados edge.
 * `deckAtMidFill` puts the paving and parapets at the mid-height of the fill column instead of at
 * the deck, which is the simplification loads.ts makes (it only matters for horizontal inertia).
 */
export function filledRing(geometry: BridgeGeometry, index: number, stoneUnitWeight: number, deckAtMidFill = false): FilledRing {
  const span = geometry.spans[index]!;
  const width = geometry.width;
  const walls = Math.min(width, 2 * SPANDREL_WALL);
  const fillWeight = (walls * stoneUnitWeight + (width - walls) * FILL_UNIT_WEIGHT) / width;
  const parapet = (2 * PARAPET_WIDTH * PARAPET_HEIGHT * stoneUnitWeight) / width;
  const paving = PAVING * stoneUnitWeight;
  const n = span.voussoirs.length;
  const a: Pt[] = span.joints.map((j) => ({ x: j.a.x, y: j.a.y }));
  const b: Pt[] = span.joints.map((j) => ({ x: j.b.x, y: j.b.y }));
  const depthAt = (x: number): number => Math.max(0, polylineAt(geometry.deck, x) - polylineAt(span.extrados, x));

  const dead: Load[] = [];
  const inertia: Load[] = [];
  let weight = 0;
  const cuts = 96;
  for (let k = 0; k < n; k++) {
    const d: Load = { fx: 0, fy: 0, mo: 0 };
    const h: Load = { fx: 0, fy: 0, mo: 0 };
    const c = polygonCentroid(span.voussoirs[k]!.outline);
    const self = stoneUnitWeight * Math.abs(c.area);
    addLoad(d, c.x, c.y, 0, -self);
    addLoad(h, c.x, c.y, self, 0);
    weight += self;
    const x0 = b[k]!.x;
    const x1 = b[k + 1]!.x;
    const dx = (x1 - x0) / cuts;
    for (let i = 0; i < cuts; i++) {
      const x = x0 + (i + 0.5) * dx;
      const bottom = polylineAt(span.extrados, x);
      const top = Math.max(bottom, polylineAt(geometry.deck, x));
      const fill = fillWeight * Math.max(0, top - bottom - PAVING) * dx;
      const mid = (bottom + top) / 2;
      const yFill = deckAtMidFill ? mid : bottom + Math.max(0, top - bottom - PAVING) / 2;
      const yPaving = deckAtMidFill ? mid : top - PAVING / 2;
      const yParapet = deckAtMidFill ? mid : top + PARAPET_HEIGHT / 2;
      addLoad(d, x, yFill, 0, -fill);
      addLoad(d, x, yPaving, 0, -paving * dx);
      addLoad(d, x, yParapet, 0, -parapet * dx);
      addLoad(h, x, yFill, fill, 0);
      addLoad(h, x, yPaving, paving * dx, 0);
      addLoad(h, x, yParapet, parapet * dx, 0);
      weight += fill + (paving + parapet) * dx;
    }
    dead.push(d);
    inertia.push(h);
  }

  const axle = (x: number): Load[] => {
    const depth = depthAt(x);
    const across = Math.min(width, AXLE_WIDTH_BASE + depth);
    const along = AXLE_LENGTH_BASE + depth;
    const from = x - along / 2;
    const to = x + along / 2;
    const loads: Load[] = [];
    for (let k = 0; k < n; k++) {
      const l: Load = { fx: 0, fy: 0, mo: 0 };
      const lo = Math.max(from, b[k]!.x);
      const hi = Math.min(to, b[k + 1]!.x);
      // 1 kN over `across` metres of width is 1 / across per metre of width.
      if (hi > lo) addLoad(l, (lo + hi) / 2, 0, 0, -((hi - lo) / along) / across);
      loads.push(l);
    }
    return loads;
  };

  return {
    a,
    b,
    dead,
    inertia,
    weight,
    depthAt,
    axle,
    withAxle: (x) => ({ a, b, dead, live: axle(x) }),
    withQuake: (dir) => ({ a, b, dead, live: inertia.map((l) => ({ fx: dir * l.fx, fy: 0, mo: dir * l.mo })) }),
  };
}
