/**
 * The rest of the bridge (SIM-SPEC section 2): supports, piers, deck, fill, relief openings and
 * the stone count. `Layout` is the lean, analytic model every calculation works from; the public
 * BridgeGeometry (with outlines for drawing) is built from it on demand.
 */
import type {
  AbutmentGeometry,
  BridgeDesign,
  BridgeGeometry,
  LevelDef,
  PierGeometry,
  ReliefGeometry,
  StoneCount,
  StoneMaterial,
  Vec2,
} from '../core/types';
import type { ArchShape } from './arch';
import { archBlocks, archJoints, archShape, extradosFoot, extradosY, spanGeometry } from './arch';
import { clearSpan } from './design';
import { STONES, groundAt, soilAt } from './materials';
import {
  APPROACH_MIN,
  APPROACH_RATIO,
  BLOCK_DEPTH,
  CLAMPS_STONE_SHARE,
  COURSES_MAX,
  CUTWATER_LENGTH,
  FILL_UNIT_WEIGHT,
  PARAPET_HEIGHT,
  PARAPET_WIDTH,
  PAVING_THICKNESS,
  PILES_STONE_SHARE,
  RELIEF_ASPECT,
  RELIEF_MIN_SPANDREL,
  RELIEF_RING_DEPTH,
  RELIEF_SILL,
  RELIEF_TOP_CLEAR,
  RELIEF_W_BASE,
  RELIEF_W_FACTOR,
  RELIEF_W_MAX,
  SHELL_THICKNESS,
  SPANDREL_THICKNESS,
} from './tuning';

export interface Layout {
  readonly level: LevelDef;
  /** Normalized design. */
  readonly design: BridgeDesign;
  readonly stone: StoneMaterial;
  readonly width: number;
  readonly shapes: readonly ArchShape[];
  readonly piers: readonly PierGeometry[];
  readonly abutments: readonly [AbutmentGeometry, AbutmentGeometry];
  /** Road surface: upper convex hull, left to right. */
  readonly deck: readonly Vec2[];
  /** Steepest deck slope (absolute rise over run). */
  readonly steepest: number;
  readonly reliefs: readonly ReliefGeometry[];
  /** Per pier: index into `reliefs`, or -1. */
  readonly reliefOf: readonly number[];
  /** Unit weight of spandrel walls and rubble blended over the width, kN/m3. */
  readonly fillWeight: number;
  /** Parapets and paving as a uniform load on the deck, kPa. */
  readonly deckLoad: number;
}

const SCRATCH = COURSES_MAX + 2;
const jax = new Float64Array(SCRATCH);
const jay = new Float64Array(SCRATCH);
const jbx = new Float64Array(SCRATCH);
const jby = new Float64Array(SCRATCH);
const blockArea = new Float64Array(SCRATCH);
const blockX = new Float64Array(SCRATCH);
const blockY = new Float64Array(SCRATCH);
let hullX = new Float64Array(512);
let hullY = new Float64Array(512);

/** Deck height at x (flat beyond the ends). */
export function deckAt(deck: readonly Vec2[], x: number): number {
  const n = deck.length;
  const first = deck[0]!;
  if (x <= first.x) return first.y;
  for (let i = 1; i < n; i++) {
    const p = deck[i]!;
    if (x <= p.x) {
      const q = deck[i - 1]!;
      return q.y + ((p.y - q.y) * (x - q.x)) / (p.x - q.x);
    }
  }
  return deck[n - 1]!.y;
}

/**
 * The deck: upper convex hull of the road ends and every crown top (SIM-SPEC 2). The backs of all
 * ring stones plus the paving are added to the point set so the road never cuts through an arch.
 */
function buildDeck(level: LevelDef, design: BridgeDesign, shapes: readonly ArchShape[]): Vec2[] {
  const site = level.site;
  const approach = Math.max(APPROACH_MIN, APPROACH_RATIO * (site.right - site.left));
  const x0 = site.left - approach;
  const x1 = site.right + approach;
  let count = 0;
  const push = (x: number, y: number): void => {
    if (count === hullX.length) {
      const nx = new Float64Array(count * 2);
      const ny = new Float64Array(count * 2);
      nx.set(hullX);
      ny.set(hullY);
      hullX = nx;
      hullY = ny;
    }
    // Insertion keeps the list sorted by x; points arrive almost in order.
    let i = count++;
    while (i > 0 && (hullX[i - 1] as number) > x) {
      hullX[i] = hullX[i - 1] as number;
      hullY[i] = hullY[i - 1] as number;
      i--;
    }
    hullX[i] = x;
    hullY[i] = y;
  };
  push(x0, site.roadLeft);
  for (const a of shapes) {
    archJoints(a, jax, jay, jbx, jby);
    for (let j = 0; j <= a.n; j++) {
      const x = jbx[j] as number;
      if (x > x0 && x < x1) push(x, (jby[j] as number) + PAVING_THICKNESS);
    }
    push(a.xc, a.apexY + Math.max(design.cover, PAVING_THICKNESS));
  }
  push(x1, site.roadRight);

  // Monotone chain, upper side only: keep right turns.
  const hx: number[] = [];
  const hy: number[] = [];
  for (let i = 0; i < count; i++) {
    const x = hullX[i] as number;
    const y = hullY[i] as number;
    let top = hx.length - 1;
    if (top >= 0 && x - hx[top]! < 1e-9) {
      if (y <= hy[top]!) continue;
      hx.pop();
      hy.pop();
      top--;
    }
    while (top >= 1) {
      const cross = (hx[top]! - hx[top - 1]!) * (y - hy[top - 1]!) - (hy[top]! - hy[top - 1]!) * (x - hx[top - 1]!);
      if (cross < 0) break;
      hx.pop();
      hy.pop();
      top--;
    }
    hx.push(x);
    hy.push(y);
  }
  const deck: Vec2[] = [];
  for (let i = 0; i < hx.length; i++) deck.push({ x: hx[i]!, y: hy[i]! });
  return deck;
}

/** Build the layout of a normalized design. `courses` forces the course count of every ring (tests). */
export function buildLayout(level: LevelDef, design: BridgeDesign, courses?: number): Layout {
  const site = level.site;
  const stone = STONES[level.stone] ?? STONES.limestone;
  const width = Math.max(1, site.width);
  const shapes: ArchShape[] = [];
  for (let i = 0; i < design.spans.length; i++) {
    const [a, b] = clearSpan(level, design.piers, i);
    const s = design.spans[i]!;
    // A degenerate clear span (normalize could not make room) still gets a tiny valid ring.
    const right = Math.max(b, a + 0.2);
    shapes.push(archShape(a, right, design.springLevel, Math.max(s.rise, 0.02), s.fullness, s.thickness, courses));
  }

  const piers: PierGeometry[] = design.piers.map((p, index) => {
    const bed = groundAt(site, p.x);
    const top = design.springLevel;
    const base = Math.min(bed - design.foundation, top - 0.5);
    return { index, x: p.x, width: p.width, bed, base, top, cutwater: design.cutwaters, soil: soilAt(site, p.x) };
  });
  const abutments: [AbutmentGeometry, AbutmentGeometry] = [
    { side: 'left', spring: { x: site.left, y: design.springLevel }, soil: soilAt(site, site.left) },
    { side: 'right', spring: { x: site.right, y: design.springLevel }, soil: soilAt(site, site.right) },
  ];

  const deck = buildDeck(level, design, shapes);
  let steepest = 0;
  for (let i = 1; i < deck.length; i++) {
    const slope = Math.abs((deck[i]!.y - deck[i - 1]!.y) / (deck[i]!.x - deck[i - 1]!.x));
    if (slope > steepest) steepest = slope;
  }

  const reliefs: ReliefGeometry[] = [];
  const reliefOf: number[] = [];
  for (const p of piers) {
    let slot = -1;
    if (design.reliefs) {
      const road = deckAt(deck, p.x);
      if (road - p.top >= RELIEF_MIN_SPANDREL) {
        const w = Math.min(RELIEF_W_FACTOR * p.width + RELIEF_W_BASE, RELIEF_W_MAX);
        const sill = p.top + RELIEF_SILL;
        const h = Math.min(RELIEF_ASPECT * w, road - RELIEF_TOP_CLEAR - sill);
        if (h >= 0.3) {
          slot = reliefs.length;
          reliefs.push({ x: p.x, sill, width: w, height: h });
        }
      }
    }
    reliefOf.push(slot);
  }

  const walls = Math.min(width, 2 * SPANDREL_THICKNESS);
  const fillWeight = (walls * stone.unitWeight + (width - walls) * FILL_UNIT_WEIGHT) / width;
  const deckLoad = (2 * PARAPET_WIDTH * PARAPET_HEIGHT * stone.unitWeight) / width + PAVING_THICKNESS * stone.unitWeight;
  return { level, design, stone, width, shapes, piers, abutments, deck, steepest, reliefs, reliefOf, fillWeight, deckLoad };
}

/** Depth of fill (and paving) over the back of a ring at x. */
export function fillDepth(layout: Layout, a: ArchShape, x: number): number {
  const d = deckAt(layout.deck, x) - extradosY(a, x);
  return d > 0 ? d : 0;
}

/** x-range of the fill that sits on pier `i` between the feet of the two rings beside it. */
export function pierFillRange(layout: Layout, i: number): readonly [number, number] {
  const left = layout.shapes[i]!;
  const right = layout.shapes[i + 1]!;
  const a = 2 * left.xc - extradosFoot(left);
  const b = extradosFoot(right);
  return b > a ? [a, b] : [layout.piers[i]!.x, layout.piers[i]!.x];
}

/** Elevation area of one ring, m2. */
export function ringArea(a: ArchShape): number {
  archBlocks(a, blockArea, blockX, blockY);
  let sum = 0;
  for (let k = 0; k < a.n; k++) sum += blockArea[k] as number;
  return sum;
}

/** Elevation area of the spandrel over one span (between ring back and deck), m2. */
export function spandrelArea(layout: Layout, a: ArchShape): number {
  const x0 = extradosFoot(a);
  const x1 = 2 * a.xc - x0;
  const steps = 16;
  const h = (x1 - x0) / steps;
  let sum = 0;
  for (let i = 0; i <= steps; i++) {
    const w = i === 0 || i === steps ? 1 : i % 2 === 1 ? 4 : 2;
    sum += w * fillDepth(layout, a, x0 + i * h);
  }
  return (sum * h) / 3;
}

/** Dressed stones by part (SIM-SPEC 2). Rubble fill is free. */
export function countStones(layout: Layout): StoneCount {
  const { level, design, stone, width, shapes, piers, deck } = layout;
  const block = Math.max(1e-3, stone.blockLength * stone.blockHeight * BLOCK_DEPTH);
  const site = level.site;

  let ringVolume = 0;
  let face = 0;
  for (const a of shapes) {
    ringVolume += ringArea(a) * width;
    face += spandrelArea(layout, a);
  }
  let pierVolume = 0;
  let extraVolume = 0;
  for (let i = 0; i < piers.length; i++) {
    const p = piers[i]!;
    const height = p.top - p.base;
    pierVolume += 2 * (p.width + width) * height * SHELL_THICKNESS;
    const [a, b] = pierFillRange(layout, i);
    face += (b - a) * Math.max(0, deckAt(deck, p.x) - p.top);
    if (p.cutwater) {
      // Two pointed noses, two faces each.
      const nose = CUTWATER_LENGTH * p.width;
      extraVolume += 4 * Math.sqrt(nose * nose + (p.width * p.width) / 4) * height * SHELL_THICKNESS;
    }
    const slot = layout.reliefOf[i]!;
    if (slot >= 0) {
      const r = layout.reliefs[slot]!;
      face -= r.width * r.height;
      extraVolume += (2 * r.height + 2 * r.width) * RELIEF_RING_DEPTH * width;
    }
  }
  // Abutment walls where the bank is lower than the springing.
  for (const x of [site.left, site.right]) {
    const drop = design.springLevel - groundAt(site, x);
    if (drop > 0) extraVolume += drop * width * SHELL_THICKNESS;
  }
  let deckLength = 0;
  for (let i = 1; i < deck.length; i++) {
    const dx = deck[i]!.x - deck[i - 1]!.x;
    const dy = deck[i]!.y - deck[i - 1]!.y;
    deckLength += Math.sqrt(dx * dx + dy * dy);
  }

  const ring = Math.round(ringVolume / block);
  const spandrels = Math.round((Math.max(0, face) * 2 * SPANDREL_THICKNESS) / block);
  const pierStones = Math.round(pierVolume / block);
  const parapets = Math.round((2 * PARAPET_WIDTH * PARAPET_HEIGHT * deckLength) / block);
  const extras =
    Math.round(extraVolume / block) +
    (design.piles ? Math.round(PILES_STONE_SHARE * pierStones) : 0) +
    (design.clamps ? Math.round(CLAMPS_STONE_SHARE * ring) : 0);
  return { ring, spandrels, piers: pierStones, parapets, extras, total: ring + spandrels + pierStones + parapets + extras };
}

/** The public geometry, with outlines for drawing. */
export function bridgeGeometry(layout: Layout, stones: StoneCount): BridgeGeometry {
  return {
    width: layout.width,
    spans: layout.shapes.map((a, i) => spanGeometry(a, i)),
    piers: layout.piers,
    abutments: layout.abutments,
    deck: layout.deck,
    parapetHeight: PARAPET_HEIGHT,
    reliefs: layout.reliefs,
    stones,
  };
}
