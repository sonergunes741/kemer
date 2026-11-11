/**
 * The landscape mesh. One indexed grid whose lines are dense around the river and grow
 * geometrically towards the horizon; the x lines pass through every point of the site's ground
 * line and z lines through the edges of the exact zone, so under the bridge the mesh is the
 * ground line itself, not an approximation of it.
 */
import { BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial, Vector2, Vector4, type Texture } from 'three';
import { clamp } from '../../core/math';
import type { BiomeDef } from './biomes';
import type { TerrainField } from './ground';
import { TERRAIN_COLOR, TERRAIN_FRAGMENT_PARS, TERRAIN_NORMAL, TERRAIN_ROUGHNESS, TERRAIN_VERTEX, TERRAIN_VERTEX_PARS } from './terrainShader';
import { meanColor, type TextureSet } from './textures';

/**
 * Grid line positions: fine inside [a, b], growing by `growth` outside, out to ±extent. Within
 * `near.run` of [a, b] the step is held at `near.step` at most, so the scenery around the bridge
 * keeps small triangles (long thin ones draw cliff edges as saw teeth).
 */
export function gridLines(
  a: number,
  b: number,
  fine: number,
  growth: number,
  extent: number,
  required: readonly number[],
  near: { run: number; step: number } = { run: 0, step: Infinity },
): number[] {
  const set = new Set<number>();
  for (let x = a; x <= b + 1e-6; x += fine) set.add(+x.toFixed(4));
  set.add(+a.toFixed(4));
  set.add(+b.toFixed(4));
  for (const r of required) if (r >= -extent && r <= extent) set.add(+r.toFixed(4));
  const cap = (d: number, step: number): number => Math.min(step, d < near.run ? Math.max(near.step, fine) : 180);
  let step = fine;
  for (let x = b; x < extent; ) {
    step = cap(x - b, step * growth);
    x = Math.min(extent, x + step);
    set.add(+x.toFixed(4));
  }
  step = fine;
  for (let x = a; x > -extent; ) {
    step = cap(a - x, step * growth);
    x = Math.max(-extent, x - step);
    set.add(+x.toFixed(4));
  }
  return [...set].sort((p, q) => p - q);
}

export interface TerrainUniforms {
  [name: string]: { value: unknown };
  uNoise: { value: Texture };
  uGrass: { value: Color };
  uDry: { value: Color };
  uSoilA: { value: Color };
  uSoilB: { value: Color };
  uRockA: { value: Color };
  uRockB: { value: Color };
  uBank: { value: Color };
  uBed: { value: Color };
  uForestCol: { value: Color };
  uCover: { value: number };
  uStrata: { value: number };
  uRockSlope: { value: Vector2 };
  uFields: { value: number };
  uForest: { value: number };
  uPools: { value: number };
  uSnow: { value: number };
  uWaterY: { value: number };
  uSlope: { value: number };
  uWetBand: { value: number };
  uCentre: { value: Vector2 };
}

export interface Terrain {
  readonly mesh: Mesh;
  readonly uniforms: TerrainUniforms;
  dispose(): void;
}

/** The ground's photo texture sets and how many metres one tile of each covers. */
export interface GroundTextures {
  readonly grass: TextureSet;
  readonly soil: TextureSet;
  readonly rock: TextureSet;
  readonly bank: TextureSet;
  /** Metres per tile: grass, soil, rock, bank. */
  readonly tiles: readonly [number, number, number, number];
}

export function createTerrain(field: TerrainField, biome: BiomeDef, noise: Texture, slope: number, textures: GroundTextures | null, detail: number): Terrain {
  const meander = field.riverWidth * biome.relief.meander + 4;
  const core0 = Math.min(field.xMin, field.channelX - field.riverWidth * 2) - meander;
  const core1 = Math.max(field.xMax, field.channelX + field.riverWidth * 2) + meander;
  const fine = clamp(Math.max(field.riverWidth / 22, (core1 - core0) / (110 * detail)), 0.2, 4);
  const xs = gridLines(core0, core1, fine, 1.1, field.extent, field.breaks);
  const zFine = clamp(fine, 0.2, 1.5);
  const zs = gridLines(-field.exactHalf, field.exactHalf, zFine, 1.075, field.extent, [0], { run: 280 * detail, step: 6 / detail });

  const nx = xs.length;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  let p = 0;
  for (let j = 0; j < nz; j++) {
    const z = zs[j]!;
    for (let i = 0; i < nx; i++) {
      const x = xs[i]!;
      pos[p++] = x;
      pos[p++] = field.height(x, z);
      pos[p++] = z;
    }
  }
  const quads = (nx - 1) * (nz - 1);
  const index = nx * nz > 65535 ? new Uint32Array(quads * 6) : new Uint16Array(quads * 6);
  let q = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      // Alternate the diagonal so long thin cells do not all lean one way.
      if ((i + j) % 2 === 0) {
        index[q++] = a;
        index[q++] = c;
        index[q++] = b;
        index[q++] = b;
        index[q++] = c;
        index[q++] = d;
      } else {
        index[q++] = a;
        index[q++] = c;
        index[q++] = d;
        index[q++] = a;
        index[q++] = d;
        index[q++] = b;
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const uniforms: TerrainUniforms = {
    uNoise: { value: noise },
    uGrass: { value: new Color(biome.grass.summer) },
    uDry: { value: new Color(biome.dry) },
    uSoilA: { value: new Color(biome.soil[0]) },
    uSoilB: { value: new Color(biome.soil[1]) },
    uRockA: { value: new Color(biome.rock[0]) },
    uRockB: { value: new Color(biome.rock[1]) },
    uBank: { value: new Color(biome.bank) },
    uBed: { value: new Color(biome.bed) },
    uForestCol: { value: new Color(0x2f4424) },
    uCover: { value: biome.cover },
    uStrata: { value: biome.strata },
    uRockSlope: { value: new Vector2(biome.rockSlope[0], biome.rockSlope[1]) },
    uFields: { value: biome.fields },
    uForest: { value: biome.forest },
    uPools: { value: biome.pools ?? 0 },
    uSnow: { value: 0 },
    uWaterY: { value: 0 },
    uSlope: { value: slope },
    uWetBand: { value: 0.3 },
    uCentre: { value: new Vector2(field.channelX, 0) },
  };
  const ground = textures !== null;
  if (textures) {
    const inv = (t: TextureSet): Color => {
      const m = meanColor(t.color);
      return new Color(1 / Math.max(m.r, 0.02), 1 / Math.max(m.g, 0.02), 1 / Math.max(m.b, 0.02));
    };
    const [g, s, r, b] = textures.tiles;
    Object.assign(uniforms, {
      uGrassCol: { value: textures.grass.color },
      uGrassNor: { value: textures.grass.normal },
      uSoilCol: { value: textures.soil.color },
      uSoilNor: { value: textures.soil.normal },
      uRockCol: { value: textures.rock.color },
      uRockNor: { value: textures.rock.normal },
      uBankCol: { value: textures.bank.color },
      uBankNor: { value: textures.bank.normal },
      uGrassInv: { value: inv(textures.grass) },
      uSoilInv: { value: inv(textures.soil) },
      uRockInv: { value: inv(textures.rock) },
      uBankInv: { value: inv(textures.bank) },
      uTile: { value: new Vector4(1 / g, 1 / s, 1 / r, 1 / b) },
    });
  }

  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  material.name = 'terrain';
  if (ground) material.defines = { K_GROUND_TEX: '' };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${TERRAIN_VERTEX_PARS}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${TERRAIN_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${TERRAIN_FRAGMENT_PARS}`)
      .replace('#include <map_fragment>', TERRAIN_COLOR)
      .replace('#include <roughnessmap_fragment>', TERRAIN_ROUGHNESS)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${TERRAIN_NORMAL}`);
  };
  material.customProgramCacheKey = () => `kemer-terrain${ground ? '-tex' : ''}`;

  const mesh = new Mesh(geometry, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.matrixAutoUpdate = false;

  return {
    mesh,
    uniforms,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
