/**
 * Where the plants stand. Seeded and pure: the same level always grows the same valley.
 * Each biome rule names a species, a zone and a density; candidates come from a jittered grid,
 * groves come from a noise mask, and nothing grows on the road, on the bridge or in the middle
 * of the default view.
 */
import { clamp, smoothstep } from '../../core/math';
import { Rng } from '../../core/rng';
import type { PlantRule, SpeciesId } from './biomes';
import { groundSlope, type TerrainField } from './ground';
import { createNoise2, fbm, hash2 } from './noise';

export interface PlantInstance {
  readonly species: SpeciesId;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rot: number;
  readonly scale: number;
  /** 0..1 per plant: colour and timing variation. */
  readonly seed: number;
  /** Order in which plants are dropped when quality asks for fewer (lower first kept). */
  readonly priority: number;
  /** Far from the bridge: drawn with the cheaper model. */
  readonly far: boolean;
}

export interface ScatterInput {
  readonly field: TerrainField;
  readonly rules: readonly PlantRule[];
  readonly seed: number;
  /** Stage of the ordinary annual flood, m above normal water: most trees stand above it. */
  readonly flood: number;
  /** The bridge footprint along x and its half width. */
  readonly bridge: { readonly x0: number; readonly x1: number; readonly halfWidth: number };
  /** Hard cap on instances. */
  readonly limit: number;
}

/** Trees that would stand between the default camera and the bridge are not planted. */
const OPEN_VIEW: ReadonlySet<SpeciesId> = new Set(['reeds', 'rock', 'bush']);

export function scatterPlants(input: ScatterInput): PlantInstance[] {
  const { field, bridge } = input;
  const length = Math.max(6, bridge.x1 - bridge.x0);
  const mid = (bridge.x0 + bridge.x1) / 2;
  const radius = clamp(length * 7, 150, 650);
  const near = clamp(length * 4, 110, 320);
  // As far upstream as the directed cameras stand (the long-lens design view the farthest).
  const viewDepth = length * 4 + 45;
  const rng = new Rng(input.seed ^ 0x51ed);
  const groves = createNoise2(input.seed + 77);
  const out: PlantInstance[] = [];

  input.rules.forEach((rule, ruleIndex) => {
    const far = rule.zone === 'far';
    const rx = far ? radius * 2.4 : radius;
    const z0 = far ? -radius * 3 : -radius * 1.4;
    const z1 = far ? radius * 1.2 : radius * 0.8;
    const cell = Math.sqrt(10000 / Math.max(0.05, rule.density));
    const rows = rule.zone === 'rows';
    const rowAngle = (hash2(ruleIndex, 3, input.seed) - 0.5) * 0.6;
    const ca = Math.cos(rowAngle);
    const sa = Math.sin(rowAngle);
    // Poplars are planted in single lines along field edges; fruit trees in orchard blocks.
    const lines = rows && rule.species === 'poplar';
    const pitchX = rows ? (lines ? 4.5 : 8) : cell;
    const pitchZ = rows ? (lines ? 42 : 7) : cell;
    const nx = Math.ceil((2 * rx) / pitchX);
    const nz = Math.ceil((z1 - z0) / pitchZ);
    const budget = Math.min(input.limit, 2600);
    let placed = 0;
    for (let iz = 0; iz < nz && placed < budget; iz++) {
      for (let ix = 0; ix < nx && placed < budget; ix++) {
        const h = hash2(ix, iz, input.seed + ruleIndex * 7919);
        let lx: number;
        let lz: number;
        if (rows) {
          // Planted lines: a rotated grid with only a little jitter.
          const gx = -rx + (ix + 0.5) * pitchX + (h - 0.5) * 0.6;
          const gz = z0 + (iz + 0.5) * pitchZ + (hash2(iz, ix, 13) - 0.5) * 0.6;
          lx = mid + gx * ca - gz * sa;
          lz = gx * sa + gz * ca;
        } else {
          lx = mid - rx + (ix + h) * pitchX;
          lz = z0 + (iz + hash2(iz, ix, input.seed + 5)) * pitchZ;
        }
        // Groves: a noise mask with a threshold set by the rule's clustering.
        const g = fbm(groves, lx / (rows ? 90 : 55) + ruleIndex * 3.1, lz / (rows ? 90 : 55), 3) * 0.5 + 0.5;
        // For planted rows the density sets how much of the land is orchard or lined with poplars.
        const threshold = rows ? 0.5 + 0.3 * (1 - clamp(rule.density / 40, 0, 1)) : rule.cluster * 0.62;
        if (g < threshold) continue;
        const keep = rows ? 0.92 : smoothstep(threshold, threshold + 0.18, g);
        if (hash2(ix * 3 + 1, iz * 5 + 2, input.seed + ruleIndex) > keep) continue;

        const x = lx;
        const z = lz;
        const dist = Math.hypot(x - mid, z);
        if (far && dist < radius * 0.55) continue;
        if (!far && dist > radius) continue;
        // The road and the bridge.
        if (Math.abs(z) < bridge.halfWidth + 3.5) continue;
        if (x > bridge.x0 - 6 && x < bridge.x1 + 6 && Math.abs(z) < bridge.halfWidth + 9) continue;
        // The directed views look downstream from +Z at the upstream face, from straight on (design)
        // to well round towards +X (building, the strike, the centuries) or a little towards -X: no
        // tree stands in that wedge, crown and all, to hide the bridge or crowd the frame.
        if (!OPEN_VIEW.has(rule.species) && z > -2 && z < viewDepth) {
          const dx = x - mid;
          if (dx > -(length * 0.6 + z * 0.55 + 7) && dx < length * 0.6 + z * 0.8 + 7) continue;
        }

        const y = field.height(x, z);
        const above = y - field.fall(z);
        const slope = groundSlope(field, x, z, 1);
        if (!fits(rule, above, slope, input.flood)) continue;

        out.push({
          species: rule.species,
          x,
          y,
          z,
          rot: rng.next() * Math.PI * 2,
          scale: rule.size[0] + (rule.size[1] - rule.size[0]) * rng.next(),
          seed: rng.next(),
          priority: rng.next(),
          far: dist > near,
        });
        placed++;
      }
    }
  });

  out.sort((a, b) => a.priority - b.priority);
  return out.length > input.limit ? out.slice(0, input.limit) : out;
}

function fits(rule: PlantRule, above: number, slope: number, flood: number): boolean {
  switch (rule.zone) {
    case 'bank':
      if (rule.species === 'reeds') return above > -0.25 && above < 0.9 && slope < 0.35;
      // Boulders at the water's edge, some standing in the shallows.
      if (rule.species === 'rock') return above > -0.4 && above < 1.4 && slope < 0.65;
      return above > 0.25 && above < flood + 1.6 && slope < 0.45;
    case 'terrace':
      return above > flood + 0.4 && slope < 0.18;
    case 'rows':
      return above > flood * 0.7 + 0.4 && slope < 0.14;
    case 'slope':
      return above > 0.6 && slope > 0.12 && slope < 0.72;
    case 'plain':
      return above > Math.max(0.35, flood * 0.6) && slope < 0.3;
    case 'far':
      return above > 2 && slope < 0.7;
  }
}
