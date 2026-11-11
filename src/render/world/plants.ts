/**
 * Instanced plants: one draw per species and level of detail. Placement comes from scatter.ts;
 * life cycles, wind and seasons run in the vertex and fragment shaders from a few shared
 * uniforms, so a valley of trees changes through the centuries at no CPU cost.
 */
import {
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  RGBADepthPacking,
  Vector3,
  type Texture,
} from 'three';
import { mulberry32 } from '../../core/rng';
import type { BiomeDef, SpeciesId } from './biomes';
import type { PlantModel } from './models';
import { plantGeometry } from './plantModels';
import type { PlantInstance } from './scatter';
import type { SeasonLook } from './seasons';
import {
  PLANT_ALPHA,
  PLANT_COLOR,
  PLANT_FRAGMENT_PARS,
  PLANT_NORMAL,
  PLANT_ROUGHNESS,
  PLANT_VERTEX,
  PLANT_VERTEX_PARS,
} from './plantShader';

interface SpeciesLook {
  readonly spring: number;
  readonly summer: number;
  readonly autumn: number;
  readonly bark: number;
  readonly evergreen: boolean;
  readonly bloom: boolean;
  /** Lifespan range in years. */
  readonly life: readonly [number, number];
}

const LOOKS: Readonly<Record<SpeciesId, SpeciesLook>> = {
  poplar: { spring: 0x9db35b, summer: 0x5e7c37, autumn: 0xd6ad3a, bark: 0x9a948a, evergreen: false, bloom: false, life: [70, 110] },
  willow: { spring: 0xa8ba6b, summer: 0x7f9653, autumn: 0xbfae52, bark: 0x5e5246, evergreen: false, bloom: false, life: [60, 100] },
  plane: { spring: 0x94b052, summer: 0x587833, autumn: 0xae8a40, bark: 0xa0968a, evergreen: false, bloom: false, life: [300, 520] },
  oak: { spring: 0x8fa84b, summer: 0x4f6a2f, autumn: 0x9a6c34, bark: 0x51483e, evergreen: false, bloom: false, life: [280, 480] },
  spruce: { spring: 0x3e5d34, summer: 0x31492c, autumn: 0x31492c, bark: 0x4a3c30, evergreen: true, bloom: false, life: [160, 260] },
  fruit: { spring: 0x8ca84f, summer: 0x5f7f37, autumn: 0xc4883a, bark: 0x4c3d31, evergreen: false, bloom: true, life: [45, 80] },
  bush: { spring: 0x809b4a, summer: 0x5a7036, autumn: 0x93683a, bark: 0x4a3e32, evergreen: false, bloom: false, life: [30, 60] },
  reeds: { spring: 0x86994c, summer: 0x76893f, autumn: 0xb39d62, bark: 0x6a5a40, evergreen: true, bloom: false, life: [1e5, 1e6] },
  rock: { spring: 0, summer: 0, autumn: 0, bark: 0, evergreen: true, bloom: false, life: [1e5, 1e6] },
};

/** Uniforms every plant material shares (one object, updated once a frame). */
export interface PlantShared {
  uTime: { value: number };
  uYear: { value: number };
  uWind: { value: number };
  uGap: { value: number };
  uLeaf: { value: number };
  uAutumn: { value: number };
  uSpringW: { value: number };
  uBloom: { value: number };
  uSnow: { value: number };
  uStraw: { value: number };
}

interface Batch {
  readonly mesh: InstancedMesh;
  /** Global priorities of this batch's instances, ascending (instances are stored in that order). */
  readonly priorities: number[];
}

/** The procedural atlas's own brightness norm (set when it was drawn). */
function atlasNorm(atlas: Texture | null): number {
  const n = atlas?.userData['norm'] as number | undefined;
  return typeof n === 'number' ? n : 1;
}

export class Plants {
  readonly group = new Object3D();
  readonly shared: PlantShared = {
    uTime: { value: 0 },
    uYear: { value: 1500 },
    uWind: { value: 0.5 },
    uGap: { value: 6 },
    uLeaf: { value: 1 },
    uAutumn: { value: 0 },
    uSpringW: { value: 0 },
    uBloom: { value: 0 },
    uSnow: { value: 0 },
    uStraw: { value: 0 },
  };
  private readonly batches: Batch[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: (MeshStandardMaterial | MeshDepthMaterial)[] = [];

  constructor(instances: readonly PlantInstance[], biome: BiomeDef, atlas: Texture | null, seed: number, models: ReadonlyMap<string, PlantModel>) {
    this.group.name = 'plants';
    const buckets = new Map<string, PlantInstance[]>();
    for (const p of instances) {
      // Boulders wear one of three shapes when the models are there.
      const variant = p.species === 'rock' ? Math.min(2, Math.floor(p.seed * 3)) : 0;
      const name = variant > 0 && models.has(`rock#${variant}:0`) ? `rock#${variant}` : p.species;
      const key = `${name}:${p.far ? 1 : 0}`;
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
      list.push(p);
    }
    const rng = mulberry32(seed ^ 0x77);
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    const t = new Vector3();
    const up = new Vector3(0, 1, 0);
    for (const [key, list] of buckets) {
      const [name, lodText] = key.split(':') as [string, string];
      const species = name.split('#')[0] as SpeciesId;
      const lod = Number(lodText);
      const look = LOOKS[species];
      // Models (about 2 400 triangles a tree) only near the bridge: hundreds of far trees in the
      // main and the mirror pass would cost millions of triangles for a few pixels each. The
      // procedural far plant (about 150) carries the same silhouette and colours.
      const model = lod === 0 || species === 'rock' || species === 'reeds' ? models.get(`${name}:0`) : undefined;
      const geometry = model?.geometry.clone() ?? plantGeometry(species, lod, 1 + (seed % 5));
      // A model with its own leaf texture wears it; everything else the procedural atlas.
      const leaves = model?.leafMap ? { map: model.leafMap, norm: model.leafNorm } : { map: atlas, norm: atlasNorm(atlas) };
      const n = list.length;
      const aSeed = new Float32Array(n);
      const aLife = new Float32Array(n * 2);
      const mesh = new InstancedMesh(geometry, this.material(species, biome, leaves, false), n);
      list.forEach((p, i) => {
        // Rocks sink into the ground; trees sink a little so slopes do not show their roots.
        const sink = species === 'rock' ? 0.3 * p.scale : 0.15;
        t.set(p.x, p.y - sink, p.z);
        q.setFromAxisAngle(up, p.rot);
        const sc = p.scale;
        s.set(sc, sc * (species === 'rock' ? 0.8 + p.seed * 0.5 : 1), sc);
        m.compose(t, q, s);
        mesh.setMatrixAt(i, m);
        aSeed[i] = p.seed;
        const span = look.life[0] + (look.life[1] - look.life[0]) * rng();
        // Born at a random point in the past, so every year finds a mixed-age valley. Reeds and
        // rocks are timeless: put them in the middle of an endless life.
        aLife[i * 2] = look.life[0] >= 1e5 ? 900 - span * 0.5 : 900 - rng() * span * 1.2;
        aLife[i * 2 + 1] = span;
      });
      geometry.setAttribute('aSeed', new InstancedBufferAttribute(aSeed, 1));
      geometry.setAttribute('aLife', new InstancedBufferAttribute(aLife, 2));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = lod === 0 && species !== 'reeds';
      mesh.receiveShadow = true;
      mesh.customDepthMaterial = this.material(species, biome, leaves, true) as unknown as MeshDepthMaterial;
      mesh.name = `plants:${key}`;
      this.group.add(mesh);
      this.geometries.push(geometry);
      this.batches.push({ mesh, priorities: list.map((p) => p.priority) });
    }
  }

  private material(species: SpeciesId, biome: BiomeDef, leaves: { map: Texture | null; norm: number }, depth: boolean): MeshStandardMaterial | MeshDepthMaterial {
    const atlas = leaves.map;
    const image = atlas?.image as { width?: number } | undefined;
    const look = LOOKS[species];
    const own = {
      uLeafSpring: { value: new Color(look.spring) },
      uLeafSummer: { value: new Color(look.summer) },
      uLeafAutumn: { value: new Color(look.autumn) },
      uBark: { value: new Color(look.bark) },
      uBlossom: { value: new Color(0xf3e3e2) },
      uReedGreen: { value: new Color(LOOKS.reeds.summer) },
      uReedStraw: { value: new Color(LOOKS.reeds.autumn) },
      uRockA: { value: new Color(biome.rock[0]) },
      uRockB: { value: new Color(biome.rock[1]) },
      uEvergreen: { value: look.evergreen ? 1 : 0 },
      uLeafNorm: { value: leaves.norm },
      uMapSize: { value: image?.width ?? 512 },
    };
    const shared = this.shared;
    const bloom = look.bloom;
    const material = depth
      ? new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map: atlas, side: DoubleSide })
      : new MeshStandardMaterial({ color: 0xffffff, map: atlas, side: DoubleSide, roughness: 0.8, metalness: 0 });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, shared, own);
      // Only fruit trees blossom: hand them the shared bloom, others a constant zero.
      shader.uniforms['uBloom'] = bloom ? shared.uBloom : { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${PLANT_VERTEX_PARS}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${PLANT_VERTEX}`);
      let frag = shader.fragmentShader.replace('#include <common>', `#include <common>\n${PLANT_FRAGMENT_PARS}`);
      if (depth) {
        frag = frag.replace('#include <alphatest_fragment>', PLANT_ALPHA);
      } else {
        frag = frag
          .replace('#include <map_fragment>', PLANT_COLOR)
          .replace('#include <alphatest_fragment>', PLANT_ALPHA)
          .replace('#include <roughnessmap_fragment>', PLANT_ROUGHNESS)
          .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\n${PLANT_NORMAL}`);
      }
      shader.fragmentShader = frag;
    };
    material.customProgramCacheKey = () => `kemer-plant-${depth ? 'depth' : 'color'}`;
    this.materials.push(material);
    return material;
  }

  /** Keep the share of plants the quality preset allows (lowest priorities first). */
  setDensity(fraction: number): void {
    for (const b of this.batches) {
      let count = 0;
      while (count < b.priorities.length && b.priorities[count]! < fraction) count++;
      b.mesh.count = count;
      b.mesh.visible = count > 0;
    }
  }

  update(dt: number, year: number, wind: number, look: SeasonLook, arid: number): void {
    const s = this.shared;
    s.uTime.value += dt;
    s.uYear.value = year;
    s.uWind.value = wind;
    s.uLeaf.value = look.leaf;
    s.uAutumn.value = look.autumn;
    s.uSpringW.value = look.spring * 0.8;
    s.uBloom.value = look.bloom;
    s.uSnow.value = look.snow;
    s.uStraw.value = Math.min(1, look.fall + look.winter + look.summer * arid * 0.6);
  }

  /** Triangles drawn per frame at the current density (for the stats line). */
  triangles(): number {
    let t = 0;
    for (const b of this.batches) {
      const g = b.mesh.geometry;
      const per = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      t += per * b.mesh.count;
    }
    return t;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.group.clear();
  }
}
