/**
 * The whole bridge as a list of stones, from a BridgeGeometry: rings, piers, face walls,
 * reliefs, parapets, coping and paving, with the extra arches of an arcade (Uzunköprü) copied
 * from the end spans. Deterministic for a given level and detail.
 */
import { Rng } from '../../core/rng';
import type { BridgeGeometry, LevelDef, PierGeometry, SpanGeometry, StoneId, Vec2 } from '../../core/types';
import { BridgeFrame } from './frame';
import { reliefStones, ringStones, type Ctx } from './layoutRing';
import { pierStones } from './layoutPier';
import { deckStones, endWalls, faceWalls } from './layoutWall';
import type { StoneSpec } from './types';

/**
 * Dressed block sizes (length along the course, course height), metres. The same numbers the
 * simulation counts stones with (src/sim/materials.ts); the render cannot import the sim.
 */
export const BLOCKS: Readonly<Record<StoneId, readonly [number, number]>> = {
  tuff: [0.6, 0.3],
  andesite: [0.55, 0.32],
  limestone: [0.6, 0.35],
  basalt: [0.5, 0.3],
  granite: [0.7, 0.4],
};

/** Bulk density, tonnes per m3, for the weight of thuds and of falling stones. */
export const DENSITY: Readonly<Record<StoneId, number>> = {
  tuff: 1.6,
  andesite: 2.5,
  limestone: 2.4,
  basalt: 2.9,
  granite: 2.65,
};

export type Phase = 'support' | 'ring' | 'finish';

export interface Layout {
  readonly stones: StoneSpec[];
  /** Build phase of every stone. */
  readonly phase: Phase[];
  /** Index of the designed span whose keystone the player lowers. */
  readonly mainSpan: number;
  readonly frame: BridgeFrame;
  /** Number of designed (not arcade) spans. */
  readonly spans: number;
}

/** The span the player lowers the keystone into: the widest, the most central on a tie. */
export function mainSpanOf(g: BridgeGeometry): number {
  let best = 0;
  let bestScore = -Infinity;
  const mid = g.spans.length > 0 ? (g.spans[0]!.left.x + g.spans[g.spans.length - 1]!.right.x) / 2 : 0;
  g.spans.forEach((s, i) => {
    const score = s.span * 1000 - Math.abs(s.crown.x - mid);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

function shiftSpan(s: SpanGeometry, dx: number, index: number): SpanGeometry {
  const m = (p: Vec2): Vec2 => ({ x: p.x + dx, y: p.y });
  return {
    index,
    left: m(s.left),
    right: m(s.right),
    crown: m(s.crown),
    span: s.span,
    joints: s.joints.map((j) => ({ a: m(j.a), b: m(j.b) })),
    voussoirs: s.voussoirs.map((v) => ({ ...v, outline: v.outline.map(m), centroid: m(v.centroid) })),
    intrados: s.intrados.map(m),
    extrados: s.extrados.map(m),
  };
}

interface Extended {
  spans: { geo: SpanGeometry; index: number; arcade: boolean }[];
  piers: { geo: PierGeometry; arcade: boolean }[];
  deck: Vec2[];
}

/** Add the arcade's copies of the end spans, with piers between them and the deck carried over. */
function extend(level: LevelDef, g: BridgeGeometry, ground: (x: number) => number): Extended {
  const spans = g.spans.map((geo, index) => ({ geo, index, arcade: false }));
  const piers = g.piers.map((geo) => ({ geo, arcade: false }));
  const arcade = level.site.arcade;
  if (!arcade || g.spans.length === 0) return { spans, piers, deck: [...g.deck] };
  const first = g.spans[0]!;
  const last = g.spans[g.spans.length - 1]!;
  const pierW = g.piers[0]?.width ?? Math.max(1.5, first.span * 0.2);
  const foundation = g.piers[0] ? g.piers[0].bed - g.piers[0].base : 2;
  const crownDeck = (x: number): number => {
    let y = g.deck[0]!.y;
    for (let i = 0; i < g.deck.length - 1; i++) {
      const a = g.deck[i]!;
      const b = g.deck[i + 1]!;
      if (x >= a.x && x <= b.x) y = a.y + ((b.y - a.y) * (x - a.x)) / Math.max(1e-9, b.x - a.x);
    }
    return y;
  };
  const leftDeck = crownDeck(first.crown.x);
  const rightDeck = crownDeck(last.crown.x);
  let next = g.spans.length;
  let pierIndex = g.piers.length;
  const addPier = (x: number): void => {
    const bed = ground(x);
    piers.push({
      geo: { index: pierIndex++, x, width: pierW, bed, base: bed - foundation, top: first.left.y, cutwater: g.piers[0]?.cutwater ?? false, soil: 'rock' },
      arcade: true,
    });
  };
  const deck: Vec2[] = g.deck.slice(1, -1);
  const pitch0 = first.span + pierW;
  for (let k = 1; k <= arcade[0]; k++) {
    spans.push({ geo: shiftSpan(first, -k * pitch0, next++), index: next - 1, arcade: true });
    addPier(first.left.x - (k - 1) * pitch0 - pierW / 2);
    deck.unshift({ x: first.crown.x - k * pitch0, y: leftDeck });
  }
  const pitch1 = last.span + pierW;
  for (let k = 1; k <= arcade[1]; k++) {
    spans.push({ geo: shiftSpan(last, k * pitch1, next++), index: next - 1, arcade: true });
    addPier(last.right.x + (k - 1) * pitch1 + pierW / 2);
    deck.push({ x: last.crown.x + k * pitch1, y: rightDeck });
  }
  const a0 = g.deck[1]!.x - g.deck[0]!.x;
  const a1 = g.deck[g.deck.length - 1]!.x - g.deck[g.deck.length - 2]!.x;
  deck.unshift({ x: deck[0]!.x - a0, y: g.deck[0]!.y });
  deck.push({ x: deck[deck.length - 1]!.x + a1, y: g.deck[g.deck.length - 1]!.y });
  return { spans, piers, deck };
}

export function buildLayout(level: LevelDef, g: BridgeGeometry, split: 0 | 1 | 2): Layout {
  const [blockLength, blockHeight] = BLOCKS[level.stone];
  const rng = new Rng((level.site.seed * 7919 + 17) >>> 0);
  const out: StoneSpec[] = [];
  const half = g.width / 2;
  const groundLine = level.site.ground;
  const flat = new BridgeFrame(g, groundLine, g.piers, [], g.deck, []);
  const ext = extend(level, g, (x) => flat.ground.at(x));
  const frame = new BridgeFrame(
    g,
    groundLine,
    ext.piers.map((p) => p.geo),
    ext.spans,
    ext.deck,
    g.reliefs,
  );
  const ctx: Ctx = { g, half, blockLength, blockHeight, split, rng: rng.fork('ring'), out };
  for (const s of ext.spans) ringStones({ ...ctx, split: s.arcade ? 0 : split }, s.geo, s.index, s.arcade);
  const pierCtx: Ctx = { ...ctx, rng: rng.fork('piers') };
  for (const p of ext.piers) pierStones(pierCtx, p.geo, p.arcade);
  reliefStones({ ...ctx, rng: rng.fork('reliefs') });
  const wall = { frame, half, springLevel: g.spans[0]?.left.y ?? 0, blockLength, blockHeight, out, parapetHeight: g.parapetHeight };
  faceWalls({ ...wall, rng: rng.fork('walls') });
  endWalls({ ...wall, rng: rng.fork('ends') });
  deckStones({ ...wall, rng: rng.fork('deck') });

  const spring = g.spans[0]?.left.y ?? 0;
  const arcadeSpans = new Set(ext.spans.filter((s) => s.arcade).map((s) => s.index));
  const stones = out.map((s) => (s.follow[0] >= 0 && arcadeSpans.has(s.follow[0]) && !s.arcade ? { ...s, arcade: true } : s));
  const phase: Phase[] = stones.map((s) => {
    if (s.kind === 'voussoir' || s.kind === 'keystone') return 'ring';
    if (s.kind === 'pier') return 'support';
    if ((s.kind === 'abutment' || s.kind === 'spandrel') && s.follow[0] < 0 && s.pivot.y < spring + 0.15) return 'support';
    return 'finish';
  });
  return { stones, phase, mainSpan: mainSpanOf(g), frame, spans: g.spans.length };
}
