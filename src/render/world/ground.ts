/**
 * The shape of the valley as a height function, pure and deterministic. Terrain mesh, water
 * heightmap and plant scatter all read this one function.
 *
 * Under the bridge (|Z| <= width/2 + a small margin) the height is exactly site.ground, so piers
 * and abutments meet the ground. Away from the bridge the cross-section is carried along the
 * river with a meander, banks get noise, the valley walls are extended beyond the ground line
 * and hills rise in layers towards the horizon.
 */
import type { SiteDef, Vec2 } from '../../core/types';
import { clamp, smoothstep } from '../../core/math';
import type { Relief } from './biomes';
import { createNoise2, fbm, ridged, type Noise2 } from './noise';

export interface TerrainField {
  /** Half the bridge width; the exact zone is |z| <= exactHalf. */
  readonly halfWidth: number;
  readonly exactHalf: number;
  /** Run over which the landscape blends from exact to free on either side of the bridge. */
  readonly rampRun: number;
  /** x range of the site's ground line. */
  readonly xMin: number;
  readonly xMax: number;
  /** x of the deepest point of the bed on the ground line. */
  readonly channelX: number;
  /** Width of the river at normal water on the ground line. */
  readonly riverWidth: number;
  /** Half size of the landscape square, metres. */
  readonly extent: number;
  /** The ground line's x values (grid lines go through them so the mesh is exact). */
  readonly breaks: readonly number[];
  /** Ground height at a world point. */
  height(x: number, z: number): number;
  /** Ground line with the valley walls extended beyond its ends. */
  profile(x: number): number;
  /** 0 within the exact zone, 1 once the landscape is free. */
  ramp(z: number): number;
  /** How far the channel is shifted along X at z (meander). */
  shift(z: number): number;
  /** dShift/dz: the river's direction is (shift'(z), -1) normalised. */
  shiftSlope(z: number): number;
  /** Height added by the bed slope at z (upstream is higher). */
  fall(z: number): number;
  /** Water edges on the ground line for a water level: [left x, right x] around the channel. */
  banks(level: number): [number, number];
}

const EXACT_MARGIN = 1;
/** How far each bank may swing in or out along the river, as a share of its distance from the axis. */
const WIDEN = 0.3;
/** The widest the free cross-section gets, relative to the ground line (for the water strip)... */
export const MAX_WIDEN = 1 + WIDEN;
/** ...plus how far a bank may slide outwards, as a share of the river's width. */
export const MAX_SLIDE = 0.2;

function interpolate(ground: readonly Vec2[], x: number): number {
  const n = ground.length;
  if (n === 0) return 0;
  if (x <= ground[0]!.x) return ground[0]!.y;
  if (x >= ground[n - 1]!.x) return ground[n - 1]!.y;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ground[mid]!.x <= x) lo = mid;
    else hi = mid;
  }
  const a = ground[lo]!;
  const b = ground[hi]!;
  const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
  return a.y + (b.y - a.y) * t;
}

export function createTerrainField(site: SiteDef, relief: Relief, seed: number): TerrainField {
  const ground = site.ground.length >= 2 ? site.ground : [
    { x: -50, y: 3 },
    { x: 0, y: -1 },
    { x: 50, y: 3 },
  ];
  const xMin = ground[0]!.x;
  const xMax = ground[ground.length - 1]!.x;
  const halfWidth = Math.max(0.5, site.width / 2);
  const exactHalf = halfWidth + EXACT_MARGIN;

  let channelX = (xMin + xMax) / 2;
  let lowest = Infinity;
  for (const p of ground) {
    if (p.y < lowest) {
      lowest = p.y;
      channelX = p.x;
    }
  }
  // A river bed that is flat across several points: take the middle of the low run.
  const low = ground.filter((p) => p.y <= lowest + 0.05);
  if (low.length > 1) channelX = (low[0]!.x + low[low.length - 1]!.x) / 2;

  const profile = (x: number): number => {
    if (x < xMin) return ground[0]!.y + wallRise(xMin - x);
    if (x > xMax) return ground[ground.length - 1]!.y + wallRise(x - xMax);
    return interpolate(ground, x);
  };
  function wallRise(d: number): number {
    return relief.wall * (1 - Math.exp(-d / Math.max(1, relief.wallRun))) + relief.far * smoothstep(0, 3200, d) * 0.6;
  }

  const banksAt = (level: number): [number, number] => {
    let left = xMin;
    for (let x = channelX; x >= xMin - 400; x -= 0.25) {
      if (profile(x) >= level) {
        left = x;
        break;
      }
    }
    let right = xMax;
    for (let x = channelX; x <= xMax + 400; x += 0.25) {
      if (profile(x) >= level) {
        right = x;
        break;
      }
    }
    return [left, right];
  };
  const [b0, b1] = banksAt(0);
  const riverWidth = Math.max(2, b1 - b0);
  const valleyHalf = Math.max((xMax - xMin) / 2, riverWidth * 2);

  const rampRun = clamp(riverWidth * 1.5, 18, 90);
  const ramp = (z: number): number => smoothstep(exactHalf, exactHalf + rampRun, Math.abs(z));
  // The banks themselves come free much sooner than the meander: within a few metres of the
  // bridge they already slump, bay and bulge, so the stream never reads as a cut canal.
  const bankRun = clamp(riverWidth * 0.6, 4, 30);
  const bankRamp = (z: number): number => smoothstep(exactHalf, exactHalf + bankRun, Math.abs(z));

  const nBank = createNoise2(seed);
  const nHill = createNoise2(seed + 101);
  const nBend = createNoise2(seed + 202);
  const nShape = createNoise2(seed + 303);
  const wavelength = Math.max(120, riverWidth * relief.bend);
  // A gentle meander: the channel never turns more than about twelve degrees off the valley.
  const amplitude = Math.min(clamp(riverWidth * relief.meander, 4, 160), wavelength * 0.035);
  const phase = nBend(0.37, 0.71) * Math.PI;
  const meander = (z: number): number => {
    const k = (Math.PI * 2) / wavelength;
    const wobble = nBend(z / (wavelength * 1.7), 3.3) * 0.35;
    return amplitude * (Math.sin(z * k + phase + wobble) - Math.sin(phase));
  };
  const shift = (z: number): number => ramp(z) * meander(z);
  const shiftSlope = (z: number): number => (shift(z + 0.5) - shift(z - 0.5)) / 1;
  const fall = (z: number): number => ramp(z) * site.slope * z;

  // How the cross-section varies along the river, as smooth functions of z: each bank swings in
  // and out on its own (bays, slumps, points), the step edges of the ground line soften by a
  // varying amount, and the bed deepens into pools and shallows over bars.
  const reach = riverWidth * 2 + 18;
  // Every camera looks at the bridge from downstream (+z). Over that first stretch the banks may
  // only fall back, as a scour pool below the arches does: a bank pushed out there would stand in
  // front of a springing.
  const stageRun = clamp(riverWidth * 3, 24, 140);
  const stage = (z: number): number => (z > 0 ? 1 - smoothstep(exactHalf + bankRun, exactHalf + bankRun + stageRun, z) : 0);
  // fbm of two octaves mostly stays within about +-0.45: stretched to +-1, then scaled. Positive
  // values move a bank away from the water.
  const wander = (x: number, y: number): number => clamp(fbm(nShape, x, y, 2) * 2.2, -1, 1);
  const outward = (w: number, z: number): number => w + (Math.abs(w) - w) * stage(z);
  const sideScale = (z: number, side: number): number => 1 + WIDEN * outward(wander(z / reach + side * 7.3, side * 3.1), z);
  // Each bank also slides across by up to a fifth of the river's width near the water: the edge
  // of the water itself wanders, with bays and points, not only the terraces above it.
  const sideShift = (z: number, side: number): number => riverWidth * MAX_SLIDE * outward(wander(z / (reach * 0.6) + side * 2.9, 5.3 + side), z);
  const softRun = clamp(riverWidth * 0.45, 1, 10);
  const soften = (z: number): number => softRun * (0.4 + 0.6 * (fbm(nShape, z / (reach * 0.7), 11.7, 2) * 0.5 + 0.5));
  const poolDepth = (z: number): number => 1 + 0.35 * wander(z / (riverWidth * 4 + 18), 23.9);

  /** The free cross-section at distance `d` from the channel axis, for a bank state at z. */
  const section = (d: number, z: number, k: number): number => {
    const side = d < 0 ? -1 : 1;
    const s = 1 + (sideScale(z, side) - 1) * k;
    // The slide fades out across the valley floor so the far walls keep their place.
    const slide = sideShift(z, side) * k * (1 - smoothstep(riverWidth, riverWidth * 4 + 10, Math.abs(d)));
    const u = channelX + d / s - slide * side;
    const p = profile(u);
    const r = soften(z) * k;
    // Soften the steps of the line above the water only: the bed keeps its depth.
    const soft = r > 0.05 ? (profile(u - r) + 2 * p + profile(u + r)) * 0.25 : p;
    const y = p + (soft - p) * smoothstep(-0.2, 0.8, p);
    return y < 0 ? y * (1 + (poolDepth(z) - 1) * k) : y;
  };

  const hillNoise: Noise2 = nHill;
  const height = (x: number, z: number): number => {
    const w = ramp(z);
    const xs = x - w * meander(z);
    const kb = bankRamp(z);
    const d = xs - channelX;
    const base = kb > 0 ? section(d, z, kb) : profile(xs);
    // Outside the ground line the landscape is free even at the bridge.
    const outside = Math.max(smoothstep(xMin, xMin - 25, xs), smoothstep(xMax, xMax + 25, xs));
    const gate = Math.max(kb, outside);
    if (gate <= 0) return base;
    const above = base - 0;
    const bankAmp = relief.rough * smoothstep(0.2, 4, above) + 0.06;
    // Below the bridge the bank's lumps only dip (see `stage`), elsewhere they rise and fall.
    const lump = fbm(nBank, x / 11, z / 11, 3);
    let y = base + gate * bankAmp * (lump - (Math.abs(lump) + lump) * stage(z));
    // Gullies down the valley walls beyond the ground line: long ribs across the valley,
    // stronger where the wall is steep, so a wall reads as weathered rock, not a smooth mound.
    const wallW = Math.max(smoothstep(xMin, xMin - relief.wallRun * 2 - 6, xs), smoothstep(xMax, xMax + relief.wallRun * 2 + 6, xs));
    if (wallW > 0) {
      const g = ridged(nShape, x / 70 + 31, z / 16, 3) - 0.35;
      y += wallW * relief.wall * 0.16 * g * Math.min(1, 40 / Math.max(10, relief.wallRun));
    }
    const ad = Math.abs(d);
    const hillW = smoothstep(valleyHalf * 0.9, valleyHalf * 0.9 + relief.hillScale * 0.6, ad);
    if (hillW > 0) {
      const s = relief.hillScale;
      const soft = fbm(hillNoise, x / s, z / s, 4) * 0.5 + 0.5;
      const sharp = ridged(hillNoise, x / (s * 0.8) + 40, z / (s * 0.8), 4);
      const hills = relief.hills * (soft * (1 - relief.ridged) + sharp * relief.ridged);
      y += gate * hillW * hills;
    }
    return y + w * site.slope * z;
  };

  const breaks = ground.map((p) => p.x);
  const extent = Math.max(4200, (xMax - xMin) * 3);

  return {
    halfWidth,
    exactHalf,
    rampRun,
    xMin,
    xMax,
    channelX,
    riverWidth,
    extent,
    breaks,
    height,
    profile,
    ramp,
    shift,
    shiftSlope,
    fall,
    banks: banksAt,
  };
}

/** Slope of the ground at a point: 1 - normal.y (0 flat, 1 vertical). */
export function groundSlope(field: TerrainField, x: number, z: number, step = 1): number {
  const hx = field.height(x + step, z) - field.height(x - step, z);
  const hz = field.height(x, z + step) - field.height(x, z - step);
  const nx = -hx / (2 * step);
  const nz = -hz / (2 * step);
  return 1 - 1 / Math.sqrt(nx * nx + nz * nz + 1);
}
