/**
 * Water (SIM-SPEC section 9): the natural channel (Manning), the Gumbel flood series, and the
 * bridge as an obstacle (open area, afflux, overtopping, scour, the face a flood pushes on).
 *
 * Stage-dependent results come from tables with running maxima, so a higher flood can never give
 * a lower level, velocity or scour whatever the cross-section looks like.
 */
import { clamp } from '../core/math';
import { mulberry32 } from '../core/rng';
import type { HazardDef, LevelDef, SiteDef } from '../core/types';
import { intradosY } from './arch';
import type { Layout } from './geometry';
import { deckAt } from './geometry';
import { SOILS, groundAt } from './materials';
import {
  AFFLUX_K,
  AFFLUX_K_CUTWATER,
  AFFLUX_K_DEBRIS,
  FLOOD_U_MAX,
  FLOOD_U_MIN,
  GRAVITY,
  GUMBEL_SPAN,
  GUMBEL_Y2,
  OPENING_SAMPLES,
  PARAPET_HEIGHT,
  SCOUR_CAP,
  SCOUR_DEBRIS_WIDTH,
  SCOUR_K1_BLUNT,
  SCOUR_K1_CUTWATER,
  SCOUR_K3,
  STAGE_SAMPLES,
  WEIR_COEFF,
} from './tuning';

/* -- flood statistics ------------------------------------------------------------------------ */

interface Gumbel {
  readonly mu: number;
  readonly beta: number;
}

function gumbel(level: LevelDef): Gumbel {
  const f = level.site.flood;
  const beta = Math.max(1e-6, (f.stage100 - f.stage2) / GUMBEL_SPAN);
  return { mu: f.stage2 - GUMBEL_Y2 * beta, beta };
}

/** Natural stage of the flood with the given return period (years). */
export function floodStage(level: LevelDef, returnPeriod: number): number {
  const g = gumbel(level);
  const t = Math.max(1.0001, Number.isFinite(returnPeriod) ? returnPeriod : 1.0001);
  return Math.max(0, g.mu - g.beta * Math.log(-Math.log(1 - 1 / t)));
}

/** Return period (years) of a natural stage. */
export function returnPeriod(level: LevelDef, stage: number): number {
  const g = gumbel(level);
  const p = Math.exp(-Math.exp(-(stage - g.mu) / g.beta));
  return 1 / Math.max(1e-9, 1 - p);
}

export interface FloodSeries {
  /** First year of the series (the year after building). */
  readonly first: number;
  /** Annual peak stage per year. */
  readonly stage: Float64Array;
  /** The named flood of each year, if any. */
  readonly named: readonly (Extract<HazardDef, { kind: 'flood' }> | null)[];
  readonly greatest: { year: number; stage: number };
}

const seriesCache = new WeakMap<LevelDef, FloodSeries>();

/** Annual flood peaks from the year after building to the end year. Deterministic per level. */
export function floodSeries(level: LevelDef): FloodSeries {
  const cached = seriesCache.get(level);
  if (cached) return cached;
  const g = gumbel(level);
  const regime = level.site.flood;
  const first = Math.floor(level.year) + 1;
  const count = Math.max(0, Math.floor(level.endYear) - first + 1);
  const stage = new Float64Array(count);
  const named: (Extract<HazardDef, { kind: 'flood' }> | null)[] = new Array(count).fill(null);
  for (let i = 0; i < count; i++) {
    const year = first + i;
    // One independent uniform variate per (seed, year).
    const u = FLOOD_U_MIN + (FLOOD_U_MAX - FLOOD_U_MIN) * mulberry32((level.site.seed ^ Math.imul(year, 0x9e3779b1)) >>> 0)();
    let h = g.mu - g.beta * Math.log(-Math.log(u));
    if (regime.regulatedFrom !== undefined && year >= regime.regulatedFrom && h > regime.stage2) {
      h = regime.stage2 + (h - regime.stage2) * (regime.regulatedFactor ?? 1);
    }
    stage[i] = Math.max(0, h);
  }
  for (const hz of level.hazards) {
    const i = hz.year - first;
    if (hz.kind === 'flood' && i >= 0 && i < count) {
      stage[i] = Math.max(0, hz.stage);
      named[i] = hz;
    }
  }
  let best = 0;
  for (let i = 1; i < count; i++) if ((stage[i] as number) > (stage[best] as number)) best = i;
  const series: FloodSeries = { first, stage, named, greatest: { year: first + best, stage: count > 0 ? (stage[best] as number) : 0 } };
  seriesCache.set(level, series);
  return series;
}

/* -- the natural channel --------------------------------------------------------------------- */

/** Flow area and wetted perimeter of the natural section at stage h (the wet reach around the river). */
export function naturalSection(site: SiteDef, h: number, out: { area: number; perimeter: number }): void {
  const g = site.ground;
  let low = 0;
  // Thalweg: lowest ground point between the abutments (or anywhere, if none lies between).
  let lowY = Infinity;
  for (let i = 0; i < g.length; i++) {
    const p = g[i]!;
    const inside = p.x >= site.left && p.x <= site.right;
    if (inside && p.y < lowY) {
      lowY = p.y;
      low = i;
    }
  }
  if (lowY === Infinity) {
    for (let i = 0; i < g.length; i++) {
      if (g[i]!.y < lowY) {
        lowY = g[i]!.y;
        low = i;
      }
    }
  }
  let area = 0;
  let perimeter = 0;
  if (h > lowY) {
    for (const dir of [-1, 1]) {
      for (let i = low; i + dir >= 0 && i + dir < g.length; i += dir) {
        const p = g[i]!;
        const q = g[i + dir]!;
        const dx = Math.abs(q.x - p.x);
        if (q.y >= h) {
          // The water's edge is on this segment.
          const t = q.y > p.y ? (h - p.y) / (q.y - p.y) : 1;
          area += ((h - p.y) * t * dx) / 2;
          perimeter += t * Math.sqrt(dx * dx + (q.y - p.y) * (q.y - p.y));
          break;
        }
        area += ((h - p.y + (h - q.y)) * dx) / 2;
        perimeter += Math.sqrt(dx * dx + (q.y - p.y) * (q.y - p.y));
        if (i + 2 * dir < 0 || i + 2 * dir >= g.length) perimeter += h - q.y;
      }
    }
  }
  out.area = area;
  out.perimeter = perimeter;
}

interface Channel {
  readonly hMax: number;
  /** Discharge per stage sample, non-decreasing. */
  readonly q: Float64Array;
}

const channelCache = new WeakMap<LevelDef, Channel>();
const section = { area: 0, perimeter: 0 };

function channel(level: LevelDef): Channel {
  const cached = channelCache.get(level);
  if (cached) return cached;
  const site = level.site;
  let hMax = Math.max(1, floodStage(level, 2000) * 1.25);
  for (const hz of level.hazards) if (hz.kind === 'flood') hMax = Math.max(hMax, hz.stage * 1.25);
  const q = new Float64Array(STAGE_SAMPLES + 1);
  const slope = Math.sqrt(Math.max(1e-7, site.slope));
  const n = Math.max(0.01, site.manningN);
  let last = 0;
  for (let i = 0; i <= STAGE_SAMPLES; i++) {
    naturalSection(site, (hMax * i) / STAGE_SAMPLES, section);
    const radius = section.perimeter > 0 ? section.area / section.perimeter : 0;
    // Manning. A floodplain that suddenly wets can lower the single-section value: keep the maximum.
    const value = (section.area * Math.pow(radius, 2 / 3) * slope) / n;
    last = Math.max(last, value);
    q[i] = last;
  }
  const ch: Channel = { hMax, q };
  channelCache.set(level, ch);
  return ch;
}

function tableAt(table: Float64Array, hMax: number, h: number): number {
  const t = clamp(h / hMax, 0, 1) * STAGE_SAMPLES;
  const i = Math.min(STAGE_SAMPLES - 1, Math.floor(t));
  return (table[i] as number) + ((table[i + 1] as number) - (table[i] as number)) * (t - i);
}

/** Discharge of the natural channel at stage h, m3/s. */
export function naturalDischarge(level: LevelDef, h: number): number {
  const ch = channel(level);
  return tableAt(ch.q, ch.hMax, h);
}

/** Mean velocity of the natural channel at stage h, m/s. */
export function naturalVelocity(level: LevelDef, h: number): number {
  naturalSection(level.site, h, section);
  return section.area > 1e-6 ? naturalDischarge(level, h) / section.area : 0;
}

/* -- the bridge in the water ----------------------------------------------------------------- */

/** HEC-18 (CSU) local pier scour depth, metres, before the soil factor. */
export function pierScourDepth(velocity: number, depth: number, pierWidth: number, k1: number, k3 = SCOUR_K3): number {
  if (depth <= 0 || velocity <= 0 || pierWidth <= 0) return 0;
  const froude = velocity / Math.sqrt(GRAVITY * depth);
  const ys = 2 * k1 * k3 * Math.pow(pierWidth / depth, 0.65) * Math.pow(froude, 0.43) * depth;
  return Math.min(ys, SCOUR_CAP * pierWidth);
}

export interface FloodState {
  /** Natural stage, and the water level upstream of the bridge. */
  stage: number;
  level: number;
  /** Mean velocity through the openings. */
  velocity: number;
  overtopped: boolean;
}

interface Rating {
  readonly level: Float64Array;
  readonly velocity: Float64Array;
}

/** Hydraulics of one bridge layout. Build once per design; everything is cached inside. */
export class Waterway {
  readonly layout: Layout;
  private readonly hMax: number;
  private readonly xs: Float64Array;
  private readonly soffit: Float64Array;
  private readonly bed: Float64Array;
  private readonly dx: Float64Array;
  private readonly lowestDeck: number;
  private readonly ratings = new Map<number, Rating>();

  constructor(layout: Layout) {
    this.layout = layout;
    this.hMax = channel(layout.level).hMax;
    const shapes = layout.shapes;
    const per = OPENING_SAMPLES + 1;
    this.xs = new Float64Array(shapes.length * per);
    this.soffit = new Float64Array(shapes.length * per);
    this.bed = new Float64Array(shapes.length * per);
    this.dx = new Float64Array(shapes.length);
    for (let s = 0; s < shapes.length; s++) {
      const a = shapes[s]!;
      this.dx[s] = a.span / OPENING_SAMPLES;
      for (let i = 0; i < per; i++) {
        const x = a.xL + (a.span * i) / OPENING_SAMPLES;
        this.xs[s * per + i] = x;
        this.soffit[s * per + i] = intradosY(a, x);
        this.bed[s * per + i] = groundAt(layout.level.site, x);
      }
    }
    let low = Infinity;
    for (const p of layout.deck) if (p.y < low) low = p.y;
    this.lowestDeck = low;
  }

  /** Open flow area under the arches (and through relief openings) at water level h, m2. */
  openArea(h: number): number {
    const per = OPENING_SAMPLES + 1;
    let area = 0;
    for (let s = 0; s < this.dx.length; s++) {
      let sum = 0;
      for (let i = 0; i < per; i++) {
        const k = s * per + i;
        const top = Math.min(h, this.soffit[k] as number);
        const open = top - (this.bed[k] as number);
        if (open > 0) sum += i === 0 || i === per - 1 ? open / 2 : open;
      }
      area += sum * (this.dx[s] as number);
    }
    for (const r of this.layout.reliefs) area += r.width * clamp(h - r.sill, 0, r.height);
    return area;
  }

  /** Share of the natural waterway the bridge leaves open at water level h, 0..1. */
  openShare(h: number): number {
    naturalSection(this.layout.level.site, h, section);
    return section.area > 1e-9 ? clamp(this.openArea(h) / section.area, 0, 1) : 1;
  }

  private weirFlow(level: number): number {
    const deck = this.layout.deck;
    let q = 0;
    for (let i = 1; i < deck.length; i++) {
      const head = level - (deck[i]!.y + deck[i - 1]!.y) / 2;
      if (head > 0) q += WEIR_COEFF * (deck[i]!.x - deck[i - 1]!.x) * head * Math.sqrt(head);
    }
    return q;
  }

  /** Level and velocity at one stage, before the monotone envelope. */
  private solve(h: number, debris: number, out: FloodState): void {
    const level = this.layout.level;
    const q = naturalDischarge(level, h);
    naturalSection(level.site, h, section);
    const vn = section.area > 1e-6 ? q / section.area : 0;
    const open = Math.max(1e-3, this.openArea(h));
    const kL = (this.layout.design.cutwaters ? AFFLUX_K_CUTWATER : AFFLUX_K) + AFFLUX_K_DEBRIS * debris;
    const headN = (vn * vn) / (2 * GRAVITY);
    let vb = q / open;
    let up = h + Math.max(0, (kL * vb * vb) / (2 * GRAVITY) - headN);
    const parapet = this.lowestDeck + PARAPET_HEIGHT;
    out.overtopped = up > parapet;
    if (out.overtopped) {
      // Part of the flow goes over the deck as a weir: find the level where orifice + weir = Q.
      let lo = h;
      let hi = up;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        const orifice = open * Math.sqrt((2 * GRAVITY * (mid - h + headN)) / kL);
        if (orifice + this.weirFlow(mid) > q) hi = mid;
        else lo = mid;
      }
      // The parapets are solid: the water stands at least to their top before it spills.
      up = Math.max(hi, Math.min(up, parapet), h);
      vb = Math.sqrt((2 * GRAVITY * (up - h + headN)) / kL);
    }
    out.stage = h;
    out.level = up;
    out.velocity = vb;
  }

  private rating(debris: number): Rating {
    let r = this.ratings.get(debris);
    if (r) return r;
    r = { level: new Float64Array(STAGE_SAMPLES + 1), velocity: new Float64Array(STAGE_SAMPLES + 1) };
    const st: FloodState = { stage: 0, level: 0, velocity: 0, overtopped: false };
    let level = 0;
    let velocity = 0;
    for (let i = 0; i <= STAGE_SAMPLES; i++) {
      this.solve((this.hMax * i) / STAGE_SAMPLES, debris, st);
      level = Math.max(level, st.level);
      velocity = Math.max(velocity, st.velocity);
      r.level[i] = level;
      r.velocity[i] = velocity;
    }
    this.ratings.set(debris, r);
    return r;
  }

  /** The bridge in a flood of natural stage `stage` carrying `debris` (0..1). */
  flood(stage: number, debris: number, out: FloodState): FloodState {
    const h = clamp(stage, 0, this.hMax);
    const r = this.rating(clamp(debris, 0, 1));
    out.stage = stage;
    out.level = Math.max(h, tableAt(r.level, this.hMax, h));
    out.velocity = tableAt(r.velocity, this.hMax, h);
    out.overtopped = out.level > this.lowestDeck + PARAPET_HEIGHT;
    return out;
  }

  /** Scour depth at pier i in that flood, metres below the bed (soil factor applied). */
  scour(i: number, flood: FloodState, debris: number): number {
    const p = this.layout.piers[i]!;
    const depth = Math.min(flood.stage, this.hMax) - p.bed;
    if (depth <= 0.05) return 0;
    const width = p.width * (1 + SCOUR_DEBRIS_WIDTH * clamp(debris, 0, 1));
    const k1 = p.cutwater ? SCOUR_K1_CUTWATER : SCOUR_K1_BLUNT;
    return pierScourDepth(flood.velocity, depth, width, k1) * SOILS[p.soil].scour;
  }

  /**
   * Masonry face of span i under water at upstream level `level`, m2: between the soffit (the
   * pier tops beside it) and the parapet top, from support axis to support axis, less its share
   * of the relief openings.
   */
  faceArea(i: number, level: number): number {
    const layout = this.layout;
    const a = layout.shapes[i]!;
    const x0 = i === 0 ? a.xL : layout.piers[i - 1]!.x;
    const x1 = i === layout.shapes.length - 1 ? a.xR : layout.piers[i]!.x;
    const steps = 2 * OPENING_SAMPLES;
    let sum = 0;
    for (let k = 0; k <= steps; k++) {
      const x = x0 + ((x1 - x0) * k) / steps;
      const bottom = x >= a.xL && x <= a.xR ? intradosY(a, x) : a.ys;
      const wet = Math.min(level, deckAt(layout.deck, x) + PARAPET_HEIGHT) - bottom;
      if (wet > 0) sum += k === 0 || k === steps ? wet / 2 : wet;
    }
    let area = (sum * (x1 - x0)) / steps;
    for (const q of [i - 1, i]) {
      const slot = q >= 0 && q < layout.piers.length ? layout.reliefOf[q]! : -1;
      if (slot >= 0) {
        const r = layout.reliefs[slot]!;
        area -= (r.width * clamp(level - r.sill, 0, r.height)) / 2;
      }
    }
    return Math.max(0, area);
  }

  /** Natural stage at which the water upstream first reaches `target` (bisection on the rating). */
  stageReaching(target: number): number {
    const st: FloodState = { stage: 0, level: 0, velocity: 0, overtopped: false };
    if (this.flood(this.hMax, 0, st).level < target) return Math.max(this.hMax, target);
    let lo = 0;
    let hi = this.hMax;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (this.flood(mid, 0, st).level >= target) hi = mid;
      else lo = mid;
    }
    return hi;
  }
}
