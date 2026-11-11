/**
 * Shapes of the biome table (biomes.ts): what a place is made of, as plain data.
 */
import type { BiomeId } from '../../core/types';

export type SpeciesId = 'poplar' | 'willow' | 'plane' | 'oak' | 'spruce' | 'fruit' | 'bush' | 'reeds' | 'rock';

/**
 * Where a plant grows. bank: just above the water line; terrace: flat ground above the floods;
 * slope: steep ground; plain: any gentle ground; rows: planted lines (orchards, poplar rows);
 * far: groves on the distant hills.
 */
export type PlantZone = 'bank' | 'terrace' | 'slope' | 'plain' | 'rows' | 'far';

export interface PlantRule {
  readonly species: SpeciesId;
  readonly zone: PlantZone;
  /** Plants per hectare where the zone fits. */
  readonly density: number;
  /** 0 = even, 1 = tight groves with gaps between. */
  readonly cluster: number;
  /** Scale range on top of the species' size. */
  readonly size: readonly [number, number];
}

export interface Relief {
  /** Height the valley walls gain just beyond the site's ground line, metres, and over what run. */
  readonly wall: number;
  readonly wallRun: number;
  /** Amplitude and horizontal scale of the hills away from the river, metres. */
  readonly hills: number;
  readonly hillScale: number;
  /** 0 = soft rolling hills, 1 = sharp eroded ridges. */
  readonly ridged: number;
  /** Rise of the far horizon (about 3 km out), metres: the outer ring of mountains. */
  readonly far: number;
  /** Small-scale bumpiness of the banks, metres. */
  readonly rough: number;
  /** Meander amplitude as a multiple of the river width, and bend length in river widths. */
  readonly meander: number;
  readonly bend: number;
}

export interface SeasonColors {
  readonly spring: number;
  readonly summer: number;
  readonly autumn: number;
  readonly winter: number;
}

export interface BiomeDef {
  readonly id: BiomeId;
  readonly relief: Relief;
  /** Grass by season, and a drier patch colour mixed in by noise. */
  readonly grass: SeasonColors;
  readonly dry: number;
  /** 0..1 how much of the gentle ground is grassed (the rest is bare soil). */
  readonly cover: number;
  readonly soil: readonly [number, number];
  /** Rock and cliff colour pair (light, dark) and how strongly it is banded in strata. */
  readonly rock: readonly [number, number];
  readonly strata: number;
  /** Slope (1 - normal.y) where bare rock starts and takes over. */
  readonly rockSlope: readonly [number, number];
  /** Bank gravel or sand, and the river bed. */
  readonly bank: number;
  readonly bed: number;
  /** 0..1 patchwork of fields and gardens on the gentle ground; and dark woods on the far hills. */
  readonly fields: number;
  readonly forest: number;
  /** 0..1 standing water in the hollows of low, flat ground (marsh pools, flooded meadows). */
  readonly pools?: number;
  /** Aerial haze: density at the water (1/m), height falloff (1/m), and its tint mixed into the sky colour. */
  readonly haze: { readonly density: number; readonly falloff: number; readonly tint: number; readonly tintMix: number };
  /** Preetham sky: turbidity, Rayleigh and Mie coefficients. */
  readonly sky: { readonly turbidity: number; readonly rayleigh: number; readonly mie: number };
  /** Typical cloud cover 0..1 (the thin layer), and how much the air moves the trees. */
  readonly clouds: number;
  readonly wind: number;
  /** Typical surface speed of the river at normal water, m/s. */
  readonly flow: number;
  readonly plants: readonly PlantRule[];
}

/** Body colour of the water by tint: deep scatter colour, shallow colour and absorption (1/m). */
export interface WaterLook {
  readonly deep: number;
  readonly shallow: number;
  readonly absorb: number;
}
