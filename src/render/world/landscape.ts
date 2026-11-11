/**
 * Everything that belongs to one river: the valley's height field, the terrain, the river,
 * the plants, the birds and the driftwood. Built by World.load and thrown away on the next.
 */
import { Color, Object3D, type Texture } from 'three';
import type { TextureSetId } from '../../core/assets';
import type { LevelDef } from '../../core/types';
import { clamp } from '../../core/math';
import { BIOMES, FLOOD_SILT, WATER_LOOKS, type BiomeDef } from './biomes';
import { Birds, Driftwood } from './ambient';
import { createTerrainField, type TerrainField } from './ground';
import type { PlantModel } from './models';
import { Plants } from './plants';
import { scatterPlants } from './scatter';
import { createTerrain, type GroundTextures, type Terrain } from './terrain';
import { loadTextureSet } from './textures';
import { River } from './water';

export interface SharedTextures {
  readonly noise: Texture;
  readonly waves: Texture;
  readonly atlas: Texture | null;
}

/** Metres one tile of each ground texture covers (public/assets/CREDITS.md). */
const TILE: Partial<Record<TextureSetId, number>> = {
  'ground-grass': 2.5,
  'ground-soil': 3.0,
  'ground-gravel': 2.2,
  'ground-sand': 2.0,
  'ground-mud': 1.3,
  'ground-rock': 2.0,
  'cliff-tuff': 2.7,
  'cliff-basalt': 2.0,
  'cliff-limestone': 5.7,
};

/** Rock and bank material per biome: the cliff of the place, gravel where the river runs fast, mud in the plains. */
function groundIds(biome: BiomeDef): { rock: TextureSetId; bank: TextureSetId } {
  const rock: TextureSetId = biome.id === 'basalt-plain' || biome.id === 'canyon' ? 'cliff-basalt' : biome.id === 'tuff-valley' ? 'cliff-tuff' : biome.id === 'rain-forest' || biome.id === 'highland' || biome.id === 'steppe-river' ? 'ground-rock' : 'cliff-limestone';
  const bank: TextureSetId = biome.id === 'alluvial-plain' || biome.id === 'marsh' ? 'ground-mud' : biome.id === 'flood-plain' ? 'ground-sand' : 'ground-gravel';
  return { rock, bank };
}

/** Ground texture sets for a biome, or null (the procedural colours alone) when any is missing. */
async function groundTextures(biome: BiomeDef): Promise<GroundTextures | null> {
  const ids = groundIds(biome);
  const [grass, soil, cliff, bankSet] = await Promise.all([loadTextureSet('ground-grass'), loadTextureSet('ground-soil'), loadTextureSet(ids.rock), loadTextureSet(ids.bank)]);
  const rockId: TextureSetId = cliff ? ids.rock : 'ground-rock';
  const rock = cliff ?? (await loadTextureSet('ground-rock'));
  const bankId: TextureSetId = bankSet ? ids.bank : 'ground-gravel';
  const bank = bankSet ?? (await loadTextureSet('ground-gravel'));
  if (!grass || !soil || !rock || !bank) return null;
  const tile = (id: TextureSetId): number => TILE[id] ?? 2.5;
  return { grass, soil, rock, bank, tiles: [tile('ground-grass'), tile('ground-soil'), tile(rockId), tile(bankId)] };
}

export class Landscape {
  readonly group = new Object3D();
  readonly biome: BiomeDef;
  readonly field: TerrainField;
  readonly terrain: Terrain;
  readonly river: River;
  readonly plants: Plants;
  readonly birds: Birds;
  readonly driftwood: Driftwood;
  /** Stage of the ordinary annual flood and the greatest the site expects, m above normal. */
  readonly flood2: number;
  readonly flood100: number;

  private constructor(level: LevelDef, biome: BiomeDef, field: TerrainField, terrain: Terrain, river: River, plants: Plants) {
    this.biome = biome;
    this.field = field;
    this.terrain = terrain;
    this.river = river;
    this.plants = plants;
    this.flood2 = level.site.flood.stage2;
    this.flood100 = level.site.flood.stage100;
    this.birds = new Birds();
    const site = level.site;
    this.birds.centre.set((site.left + site.right) / 2, Math.max(site.roadLeft, site.roadRight), 0);
    this.birds.span = clamp((site.right - site.left) * 2.5, 40, 260);
    const halfWidthAt = (): number => {
      const [l, r] = field.banks(river.state.level);
      return Math.max(1, (r - l) / 2);
    };
    const [b0, b1] = field.banks(0);
    const centre0 = (b0 + b1) / 2;
    this.driftwood = new Driftwood(
      (z) => centre0 + field.shift(z),
      (z) => river.surfaceAt(z),
      halfWidthAt,
      () => river.state.speed,
      clamp(field.riverWidth * 6, 80, 400),
    );
    this.group.name = 'landscape';
    this.group.add(terrain.mesh, river.mesh, plants.group, this.birds.mesh, this.driftwood.mesh);
  }

  static async create(level: LevelDef, shared: SharedTextures, detail: number, models: ReadonlyMap<string, PlantModel>): Promise<Landscape> {
    const biome = BIOMES[level.env.biome] ?? BIOMES['green-valley'];
    const site = level.site;
    const field = createTerrainField(site, biome.relief, level.env.seed);
    const textures = await groundTextures(biome);
    const terrain = createTerrain(field, biome, shared.noise, site.slope, textures, detail);
    const maxLevel = Math.max(site.flood.stage100 * 1.3 + 1, 3);
    const river = new River(field, shared.waves, maxLevel, site.width / 2);
    const look = WATER_LOOKS[level.env.water] ?? WATER_LOOKS.green;
    river.setColors(look.deep, look.shallow, FLOOD_SILT, look.absorb);
    river.setState({ level: 0, speed: biome.flow, turbidity: 0.08, rough: 0.08, heap: 0 });
    const instances = scatterPlants({
      field,
      rules: biome.plants,
      seed: level.env.seed,
      flood: site.flood.stage2,
      bridge: { x0: site.left, x1: site.right, halfWidth: site.width / 2 },
      limit: 6000,
    });
    const plants = new Plants(instances, biome, shared.atlas, level.env.seed, models);
    return new Landscape(level, biome, field, terrain, river, plants);
  }

  /** Stone-dust colour for this place: the light rock of the biome. */
  dustColor(): Color {
    return new Color(this.biome.rock[0]).lerp(new Color(0.8, 0.77, 0.7), 0.4);
  }

  dispose(): void {
    this.terrain.dispose();
    this.river.dispose();
    this.plants.dispose();
    this.birds.dispose();
    this.driftwood.dispose();
    this.group.clear();
  }
}
