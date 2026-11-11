/**
 * Making a player's design consistent (SIM-SPEC section 2, last paragraph). normalize never
 * throws and is idempotent: whatever comes in, a buildable-shaped design comes out.
 */
import { clamp } from '../core/math';
import type { BridgeDesign, LevelDef, PierDesign, SpanDesign } from '../core/types';
import { archShape } from './arch';
import { MIN_PIER_WIDTH, MIN_THICKNESS, RISE_MAX_RATIO, RISE_MIN_RATIO } from './tuning';

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Limits with the level's ranges put in order and floored at sane minimums. */
export interface Ranges {
  readonly thickness: readonly [number, number];
  readonly pierWidth: readonly [number, number];
  readonly cover: readonly [number, number];
  readonly foundation: readonly [number, number];
  readonly spring: readonly [number, number];
  readonly zone: readonly [number, number];
  readonly minPiers: number;
  readonly maxPiers: number;
  readonly minSpan: number;
}

function ordered(range: readonly [number, number] | undefined, floor: number, fallback: number): [number, number] {
  const lo = Math.max(floor, num(range?.[0], fallback));
  const hi = Math.max(lo, num(range?.[1], lo));
  return [lo, hi];
}

export function rangesOf(level: LevelDef): Ranges {
  const site = level.site;
  const lim = level.limits;
  const length = Math.max(1, site.right - site.left);
  const maxPiers = Math.max(0, Math.floor(num(lim.maxPiers, 0)));
  const z0 = clamp(num(site.pierZone?.[0], site.left), site.left, site.right);
  const z1 = clamp(num(site.pierZone?.[1], site.right), z0, site.right);
  return {
    thickness: ordered(lim.thickness, MIN_THICKNESS, 0.5),
    pierWidth: ordered(lim.pierWidth, MIN_PIER_WIDTH, 2),
    cover: ordered(lim.cover, 0, 0.4),
    foundation: ordered(lim.foundation, 0, 1),
    spring: ordered(site.springRange, -1e6, site.springLevel),
    zone: [z0, z1],
    minPiers: clamp(Math.floor(num(lim.minPiers, 0)), 0, maxPiers),
    maxPiers,
    minSpan: clamp(num(lim.minSpan, 1), 0.5, length),
  };
}

/** Clear span i of a sorted pier list: from the right face of support i to the left face of support i + 1. */
export function clearSpan(level: LevelDef, piers: readonly PierDesign[], i: number): readonly [number, number] {
  const left = i === 0 ? level.site.left : piers[i - 1]!.x + piers[i - 1]!.width / 2;
  const right = i === piers.length ? level.site.right : piers[i]!.x - piers[i]!.width / 2;
  return [left, right];
}

/** Rise range of a clear span. */
export function riseRange(span: number): readonly [number, number] {
  return [RISE_MIN_RATIO * span, RISE_MAX_RATIO * span];
}

/**
 * The thickest ring span i may have without running into its neighbour above a pier: the
 * springing joint leans into the pier by thickness x |cos| of its angle, and each ring keeps to
 * its own half of the pier top. Infinity for a span between abutments or with upright skewbacks.
 * (Two rings sharing the same stone were drawn through each other and weighed twice.)
 */
export function thicknessRoom(level: LevelDef, piers: readonly PierDesign[], i: number, rise: number, fullness: number): number {
  let room = Infinity;
  if (i > 0) room = Math.min(room, piers[i - 1]!.width / 2);
  if (i < piers.length) room = Math.min(room, piers[i]!.width / 2);
  if (room === Infinity) return Infinity;
  const [a, b] = clearSpan(level, piers, i);
  // Same guards as buildLayout, so the answer is about the ring that will be built.
  const lean = Math.abs(Math.cos(archShape(a, Math.max(b, a + 0.2), 0, Math.max(rise, 0.02), fullness, 1, 9).thetaS));
  return lean > 1e-9 ? room / lean : Infinity;
}

/** Move piers apart until every clear span is at least minSpan and every pier is inside the zone. */
function placePiers(level: LevelDef, r: Ranges, piers: PierDesign[]): boolean {
  let face = level.site.left;
  for (const p of piers) {
    p.x = Math.max(p.x, face + r.minSpan + p.width / 2, r.zone[0] + p.width / 2);
    face = p.x + p.width / 2;
  }
  face = level.site.right;
  for (let i = piers.length - 1; i >= 0; i--) {
    const p = piers[i]!;
    p.x = Math.min(p.x, face - r.minSpan - p.width / 2, r.zone[1] - p.width / 2);
    face = p.x - p.width / 2;
  }
  // The backward pass can only break what the forward pass fixed when there is no room at all.
  face = level.site.left;
  for (const p of piers) {
    if (p.x - p.width / 2 - face < r.minSpan - 1e-9 || p.x - p.width / 2 < r.zone[0] - 1e-9) return false;
    face = p.x + p.width / 2;
  }
  return true;
}

function sanitizeSpan(raw: Partial<SpanDesign> | undefined, fallback: SpanDesign): SpanDesign {
  return {
    rise: num(raw?.rise, fallback.rise),
    fullness: clamp(num(raw?.fullness, fallback.fullness), 0, 1),
    thickness: num(raw?.thickness, fallback.thickness),
  };
}

export function normalize(level: LevelDef, design: BridgeDesign): BridgeDesign {
  const r = rangesOf(level);
  const site = level.site;
  const starter = level.starter;
  const d: Partial<BridgeDesign> = design !== null && typeof design === 'object' ? design : starter;

  // Piers: sane numbers, sorted, the allowed count, room between them.
  const starterWidth = clamp(num(starter.piers?.[0]?.width, r.pierWidth[0]), r.pierWidth[0], r.pierWidth[1]);
  const middle = (site.left + site.right) / 2;
  let piers: PierDesign[] = (Array.isArray(d.piers) ? d.piers : []).map((p: Partial<PierDesign> | undefined) => ({
    x: num(p?.x, middle),
    width: clamp(num(p?.width, starterWidth), r.pierWidth[0], r.pierWidth[1]),
  }));
  piers.sort((a, b) => a.x - b.x);
  if (piers.length > r.maxPiers) piers.length = r.maxPiers;
  while (piers.length < r.minPiers) {
    // Split the widest gap between support axes.
    let at = 0;
    let widest = -1;
    for (let i = 0; i <= piers.length; i++) {
      const a = i === 0 ? site.left : piers[i - 1]!.x;
      const b = i === piers.length ? site.right : piers[i]!.x;
      if (b - a > widest) {
        widest = b - a;
        at = i;
      }
    }
    const a = at === 0 ? site.left : piers[at - 1]!.x;
    piers.splice(at, 0, { x: a + widest / 2, width: starterWidth });
  }
  while (!placePiers(level, r, piers)) {
    if (piers.length > r.minPiers) {
      piers.pop();
    } else {
      // No room even so: spread the piers evenly at their narrowest and let validate complain.
      const count = piers.length;
      piers = piers.map((_, i) => ({ x: site.left + ((i + 1) * (site.right - site.left)) / (count + 1), width: r.pierWidth[0] }));
      break;
    }
  }

  // Spans: one more than piers; when linked they all copy span 0.
  const linked = d.linked === true;
  const fallbackSpan: SpanDesign = sanitizeSpan(starter.spans?.[0], { rise: (site.right - site.left) / 4, fullness: 1, thickness: r.thickness[0] });
  const rawSpans: (Partial<SpanDesign> | undefined)[] = Array.isArray(d.spans) ? d.spans : [];
  const spans: SpanDesign[] = [];
  let riseLo = 0;
  let riseHi = Infinity;
  for (let i = 0; i <= piers.length; i++) {
    const [a, b] = clearSpan(level, piers, i);
    const range = riseRange(Math.max(0.1, b - a));
    riseLo = Math.max(riseLo, range[0]);
    riseHi = Math.min(riseHi, range[1]);
  }
  const base = sanitizeSpan(rawSpans[0], fallbackSpan);
  if (linked) {
    // One rise for every span: inside all their ranges when those overlap, else inside span 0's
    // (clamping span 0 first keeps a second normalize from changing anything).
    const first = clearSpan(level, piers, 0);
    const own = riseRange(Math.max(0.1, first[1] - first[0]));
    base.rise = riseLo <= riseHi ? clamp(base.rise, riseLo, riseHi) : clamp(base.rise, own[0], own[1]);
  }
  for (let i = 0; i <= piers.length; i++) {
    // A span that did not exist copies its left neighbour.
    const own = linked ? base : sanitizeSpan(rawSpans[i], spans[i - 1] ?? base);
    const [a, b] = clearSpan(level, piers, i);
    const range = riseRange(Math.max(0.1, b - a));
    spans.push({
      rise: clamp(own.rise, range[0], range[1]),
      fullness: own.fullness,
      thickness: clamp(own.thickness, r.thickness[0], r.thickness[1]),
    });
  }

  // Rings that share a pier stay out of each other (never below the level's thinnest ring).
  let room = Infinity;
  const rooms = spans.map((s, i) => thicknessRoom(level, piers, i, s.rise, s.fullness));
  for (const x of rooms) room = Math.min(room, x);
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i]!;
    s.thickness = Math.max(r.thickness[0], Math.min(s.thickness, linked ? room : (rooms[i] as number)));
  }

  return {
    v: 1,
    springLevel: clamp(num(d.springLevel, site.springLevel), r.spring[0], r.spring[1]),
    piers,
    spans,
    linked,
    cover: clamp(num(d.cover, num(starter.cover, r.cover[0])), r.cover[0], r.cover[1]),
    foundation: clamp(num(d.foundation, num(starter.foundation, r.foundation[0])), r.foundation[0], r.foundation[1]),
    cutwaters: d.cutwaters === true,
    reliefs: d.reliefs === true,
    clamps: d.clamps === true,
    piles: d.piles === true,
  };
}
