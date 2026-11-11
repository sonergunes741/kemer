/**
 * The design handles as rules: which handles a level shows, where each grip sits on the drawing,
 * the axis it moves along, the value it carries, its limits, and how a grip position becomes a
 * new value. Pure functions of the level, the design and its geometry.
 */
import type { HandleId, HandleKind, HandleModel } from '../../core/contracts';
import type { BridgeDesign, BridgeGeometry, LevelDef, SpanGeometry, ToolId, Vec2 } from '../../core/types';

const UP: Vec2 = { x: 0, y: 1 };
const DOWN: Vec2 = { x: 0, y: -1 };
const SIDE: Vec2 = { x: 1, y: 0 };

/** Fullness moves in twentieths: fine enough to shape, coarse enough to tick. */
export const FULLNESS_STEP = 0.05;

/**
 * Where the ring and cover grips sit beside the crown, as shares of the span (left, right). On a
 * landscape phone river 1's span is about 310 px, so 0.15 keeps the ring grip about 50 px from the
 * crown grip: two 44 px finger targets that no longer overlap.
 */
const RING_OFFSET = 0.15;
const COVER_OFFSET = 0.17;

const TOOL_OF: Record<HandleKind, ToolId> = {
  crown: 'rise',
  ring: 'thickness',
  haunch: 'fullness',
  pier: 'piers',
  'pier-side': 'pier-width',
  spring: 'spring',
  cover: 'cover',
  foundation: 'foundation',
};

export function toolOf(kind: HandleKind): ToolId {
  return TOOL_OF[kind];
}

/** The widest span: where a linked bridge shows its span handles, and where the keystone goes. */
export function mainSpan(geometry: BridgeGeometry): number {
  let best = 0;
  geometry.spans.forEach((s, i) => {
    if (s.span > (geometry.spans[best]?.span ?? 0) + 1e-6) best = i;
  });
  return best;
}

/** Span handles: on the main span when all spans are linked, on every span otherwise. */
export function editableSpans(design: BridgeDesign, geometry: BridgeGeometry): number[] {
  if (design.linked || geometry.spans.length === 1) return [mainSpan(geometry)];
  return geometry.spans.map((_, i) => i);
}

/** Height of a polyline at x (linear between its points; ends held). */
export function yAt(line: readonly Vec2[], x: number): number {
  if (line.length === 0) return 0;
  if (x <= line[0]!.x) return line[0]!.y;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    if (x <= b.x) return b.x === a.x ? b.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  }
  return line[line.length - 1]!.y;
}

/** The haunch: a point on the intrados halfway (in x) between springing and crown, and its chord. */
export function haunchFrame(sp: SpanGeometry): { at: Vec2; mid: Vec2; normal: Vec2; bulge: number } {
  const L = sp.left;
  const C = sp.crown;
  const x = (L.x + C.x) / 2;
  const at = { x, y: yAt(sp.intrados, x) };
  const dx = C.x - L.x;
  const dy = C.y - L.y;
  const len = Math.hypot(dx, dy) || 1;
  // Outward normal of the chord from springing to crown: up and away from the span's middle.
  const normal = { x: -dy / len, y: dx / len };
  const mid = { x: (L.x + C.x) / 2, y: (L.y + C.y) / 2 };
  const bulge = (at.x - mid.x) * normal.x + (at.y - mid.y) * normal.y;
  return { at, mid, normal, bulge };
}

/** The design value a handle edits (fullness for the haunch, metres for the rest). */
export function readValue(design: BridgeDesign, id: HandleId): number {
  const s = design.spans[id.index] ?? design.spans[0]!;
  const p = design.piers[id.index];
  switch (id.kind) {
    case 'crown':
      return s.rise;
    case 'ring':
      return s.thickness;
    case 'haunch':
      return s.fullness;
    case 'pier':
      return p?.x ?? 0;
    case 'pier-side':
      return p?.width ?? 0;
    case 'spring':
      return design.springLevel;
    case 'cover':
      return design.cover;
    case 'foundation':
      return design.foundation;
  }
}

/** A copy of the design with one value changed (all spans together when they are linked). */
export function writeValue(design: BridgeDesign, id: HandleId, value: number): BridgeDesign {
  const d: BridgeDesign = { ...design, spans: design.spans.map((s) => ({ ...s })), piers: design.piers.map((p) => ({ ...p })) };
  const spanKey = id.kind === 'crown' ? 'rise' : id.kind === 'ring' ? 'thickness' : id.kind === 'haunch' ? 'fullness' : null;
  if (spanKey) {
    const targets = d.linked ? d.spans : d.spans.filter((_, i) => i === id.index);
    for (const s of targets) s[spanKey] = value;
    return d;
  }
  const p = d.piers[id.index];
  if (id.kind === 'pier' && p) p.x = value;
  else if (id.kind === 'pier-side' && p) p.width = value;
  else if (id.kind === 'spring') d.springLevel = value;
  else if (id.kind === 'cover') d.cover = value;
  else if (id.kind === 'foundation') d.foundation = value;
  return d;
}

/** The range a handle's value may take on this level, as far as the game can know it. */
export function valueRange(level: LevelDef, design: BridgeDesign, geometry: BridgeGeometry, id: HandleId): readonly [number, number] {
  const lim = level.limits;
  switch (id.kind) {
    case 'crown': {
      const span = geometry.spans[id.index]?.span ?? 1;
      return [0.1 * span, 1.0 * span];
    }
    case 'ring':
      return lim.thickness;
    case 'haunch':
      return [0, 1];
    case 'pier':
      return pierRange(level, design, id.index);
    case 'pier-side':
      return lim.pierWidth;
    case 'spring':
      return level.site.springRange;
    case 'cover':
      return lim.cover;
    case 'foundation':
      return lim.foundation;
  }
}

/** Where pier i may stand: inside the zone, a minimum span from its neighbours. */
export function pierRange(level: LevelDef, design: BridgeDesign, i: number): readonly [number, number] {
  const site = level.site;
  const p = design.piers[i];
  if (!p) return [site.left, site.right];
  const prev = design.piers[i - 1];
  const next = design.piers[i + 1];
  const leftFace = prev ? prev.x + prev.width / 2 : site.left;
  const rightFace = next ? next.x - next.width / 2 : site.right;
  const lo = Math.max(leftFace + level.limits.minSpan + p.width / 2, site.pierZone[0] + p.width / 2);
  const hi = Math.min(rightFace - level.limits.minSpan - p.width / 2, site.pierZone[1] - p.width / 2);
  return lo <= hi ? [lo, hi] : [p.x, p.x];
}

interface Grip {
  readonly at: Vec2;
  readonly axis: Vec2;
  /** What the player reads beside the grip, metres. */
  readonly shown: number;
}

function gripOf(design: BridgeDesign, geometry: BridgeGeometry, id: HandleId): Grip | null {
  const sp = geometry.spans[id.index];
  const pr = geometry.piers[id.index];
  switch (id.kind) {
    case 'crown':
      return sp ? { at: sp.crown, axis: UP, shown: readValue(design, id) } : null;
    case 'ring': {
      // A little to the left of the crown on the back of the ring: on top of the crown grip it
      // would sit within a hand's width of it and of the cover's (askedValue reads the drag, not the spot).
      if (!sp) return null;
      const x = sp.crown.x - sp.span * RING_OFFSET;
      return { at: { x, y: yAt(sp.extrados, x) }, axis: UP, shown: readValue(design, id) };
    }
    case 'haunch': {
      if (!sp) return null;
      const f = haunchFrame(sp);
      return { at: f.at, axis: f.normal, shown: f.bulge };
    }
    case 'pier': {
      if (!pr) return null;
      const foot = Math.max(pr.bed, 0);
      return { at: { x: pr.x, y: foot + 0.22 * (pr.top - foot) }, axis: SIDE, shown: pr.x - (geometry.abutments[0].spring.x ?? 0) };
    }
    case 'pier-side': {
      if (!pr) return null;
      const foot = Math.max(pr.bed, 0);
      return { at: { x: pr.x + pr.width / 2, y: foot + 0.7 * (pr.top - foot) }, axis: SIDE, shown: pr.width };
    }
    case 'spring':
      return { at: geometry.abutments[0].spring, axis: UP, shown: design.springLevel };
    case 'cover': {
      const top = geometry.spans.reduce((a, s) => (s.crown.y > a.crown.y ? s : a), geometry.spans[0]!);
      // On the road to the right of the crown, clear of the crown and ring grips.
      const x = top.crown.x + top.span * COVER_OFFSET;
      return { at: { x, y: yAt(geometry.deck, x) }, axis: UP, shown: design.cover };
    }
    case 'foundation':
      return pr ? { at: { x: pr.x, y: pr.base }, axis: DOWN, shown: design.foundation } : null;
  }
}

/** Every handle the level's tools allow, placed on the current drawing. */
export function handleIds(level: LevelDef, design: BridgeDesign, geometry: BridgeGeometry): HandleId[] {
  const tools = level.tools;
  const ids: HandleId[] = [];
  for (const i of editableSpans(design, geometry)) {
    if (tools.includes('rise')) ids.push({ kind: 'crown', index: i });
    if (tools.includes('fullness')) ids.push({ kind: 'haunch', index: i });
    if (tools.includes('thickness')) ids.push({ kind: 'ring', index: i });
  }
  geometry.piers.forEach((_, i) => {
    if (tools.includes('piers')) ids.push({ kind: 'pier', index: i });
    if (tools.includes('pier-width')) ids.push({ kind: 'pier-side', index: i });
    if (tools.includes('foundation')) ids.push({ kind: 'foundation', index: i });
  });
  if (tools.includes('spring') && level.site.springRange[1] > level.site.springRange[0]) ids.push({ kind: 'spring', index: 0 });
  if (tools.includes('cover') && level.limits.cover[1] > level.limits.cover[0]) ids.push({ kind: 'cover', index: 0 });
  return ids;
}

export function handleModels(level: LevelDef, design: BridgeDesign, geometry: BridgeGeometry, stops: ReadonlyMap<string, -1 | 1>): HandleModel[] {
  const out: HandleModel[] = [];
  for (const id of handleIds(level, design, geometry)) {
    const grip = gripOf(design, geometry, id);
    if (!grip) continue;
    const v = readValue(design, id);
    const [lo, hi] = valueRange(level, design, geometry, id);
    const eps = 1e-6 + (hi - lo) * 1e-4;
    const stop = stops.get(handleKey(id));
    out.push({ id, at: grip.at, axis: grip.axis, value: grip.shown, atMin: v <= lo + eps || stop === -1, atMax: v >= hi - eps || stop === 1 });
  }
  return out;
}

export function handleKey(id: HandleId): string {
  return `${id.kind}:${id.index}`;
}

/** The grip position a handle has right now (for the start of a drag). */
export function gripAt(design: BridgeDesign, geometry: BridgeGeometry, id: HandleId): Vec2 | null {
  return gripOf(design, geometry, id)?.at ?? null;
}

/**
 * The raw value the player asks for by putting the grip at `to`. `start` is the value and grip at
 * the grab, for handles whose grip does not sit exactly on its value (ring, cover, foundation).
 * The haunch is answered separately (it needs the curve's own response, see editor.ts).
 */
export function askedValue(geometry: BridgeGeometry, design: BridgeDesign, id: HandleId, to: Vec2, start: { value: number; at: Vec2 }): number {
  switch (id.kind) {
    case 'crown': {
      const sp = geometry.spans[id.index];
      return sp ? to.y - sp.left.y : start.value;
    }
    case 'ring':
    case 'cover':
      return start.value + (to.y - start.at.y);
    case 'foundation':
      return start.value + (start.at.y - to.y);
    case 'pier':
      return to.x;
    case 'pier-side': {
      const p = design.piers[id.index];
      return p ? 2 * Math.abs(to.x - p.x) : start.value;
    }
    case 'spring':
      return to.y;
    case 'haunch':
      return start.value;
  }
}
