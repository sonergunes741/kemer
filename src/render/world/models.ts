/**
 * Plant models from the art team, read with a small GLB reader (static meshes only: positions,
 * normals, first UV set, vertex colour as ambient occlusion, indices, node transforms). Leaves
 * are recognised by an alpha-masked material or a leafy material name, and keep the model's own
 * leaf texture when it has one. Anything missing or unreadable falls back to the procedural
 * plants, so the manifest can grow one model at a time.
 *
 * GLTFLoader is not used on purpose: it is not among Vite's pre-bundled dependencies, and pulling
 * it in mid-session would make the dev server re-optimise and reload every other team's page.
 */
import { BufferAttribute, BufferGeometry, LinearMipmapLinearFilter, Matrix4, Quaternion, SRGBColorSpace, Texture, Vector3 } from 'three';
import { hasModel, modelUrl, type ModelId } from '../../core/assets';
import { log } from '../../core/log';
import type { SpeciesId } from './biomes';
import { plantGeometry } from './plantModels';
import { textureNorm } from './textures';

/**
 * The model each species wears. Two of the art set are left out on purpose: `tree-willow` and
 * `bush` are closed, smooth domes that read as haystacks on the bank. The willows of Anatolian
 * rivers are mostly white willows with a broad, open crown, which the oak's shape carries well in
 * the willow's own grey-green; bushes use the procedural clump, whose open lobes look like scrub.
 */
const SPECIES_MODEL: Partial<Record<SpeciesId, ModelId>> = {
  poplar: 'tree-poplar',
  willow: 'tree-oak',
  oak: 'tree-oak',
  plane: 'tree-plane',
  spruce: 'tree-spruce',
  reeds: 'reeds',
  rock: 'rock-a',
};

interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  normalized?: boolean;
  count: number;
  type: string;
}
interface GltfMaterial {
  name?: string;
  alphaMode?: string;
  pbrMetallicRoughness?: { baseColorTexture?: { index: number } };
}
interface GltfJson {
  accessors?: GltfAccessor[];
  bufferViews?: { byteOffset?: number; byteLength: number; byteStride?: number }[];
  meshes?: { primitives: { attributes: Record<string, number>; indices?: number; material?: number }[] }[];
  materials?: GltfMaterial[];
  textures?: { source?: number; extensions?: Record<string, { source?: number } | undefined> }[];
  images?: { bufferView?: number; mimeType?: string }[];
  nodes?: { mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[];
  scenes?: { nodes: number[] }[];
  scene?: number;
}

/** A parsed model: one geometry with the plant attributes, and the leaf image if it has one. */
export interface ParsedModel {
  geometry: BufferGeometry;
  leafImage: { bytes: Uint8Array; mime: string } | null;
}

/** A model ready for the plants: the leaf map (null: use the procedural atlas) and its norm. */
export interface PlantModel {
  geometry: BufferGeometry;
  leafMap: Texture | null;
  /** Scales the leaf map's colour to a mean of 1, so the species colours stay in charge. */
  leafNorm: number;
}

const SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const BYTES: Record<number, number> = { 5126: 4, 5125: 4, 5123: 2, 5122: 2, 5121: 1, 5120: 1 };
const NORM: Record<number, number> = { 5123: 65535, 5121: 255, 5122: 32767, 5120: 127 };

function readAccessor(json: GltfJson, bin: DataView, index: number): Float32Array {
  const acc = json.accessors?.[index];
  if (!acc || acc.bufferView === undefined) throw new Error(`accessor ${index} missing`);
  const view = json.bufferViews?.[acc.bufferView];
  if (!view) throw new Error(`bufferView ${acc.bufferView} missing`);
  const comps = SIZE[acc.type] ?? 1;
  const bytes = BYTES[acc.componentType] ?? 4;
  const stride = view.byteStride ?? comps * bytes;
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const scale = acc.normalized ? 1 / (NORM[acc.componentType] ?? 1) : 1;
  const out = new Float32Array(acc.count * comps);
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < comps; c++) {
      const o = base + i * stride + c * bytes;
      const t = acc.componentType;
      const raw =
        t === 5126 ? bin.getFloat32(o, true) : t === 5125 ? bin.getUint32(o, true) : t === 5123 ? bin.getUint16(o, true) : t === 5122 ? bin.getInt16(o, true) : t === 5120 ? bin.getInt8(o) : bin.getUint8(o);
      out[i * comps + c] = raw * scale;
    }
  }
  return out;
}

/** The embedded image behind a material's base colour, if any (plain or EXT_texture_webp). */
function baseImage(json: GltfJson, bin: DataView, mat: GltfMaterial | undefined): ParsedModel['leafImage'] {
  const tex = mat?.pbrMetallicRoughness?.baseColorTexture;
  if (!tex) return null;
  const t = json.textures?.[tex.index];
  const source = t?.extensions?.['EXT_texture_webp']?.source ?? t?.source;
  const image = source === undefined ? undefined : json.images?.[source];
  const view = image?.bufferView === undefined ? undefined : json.bufferViews?.[image.bufferView];
  if (!image || !view) return null;
  const bytes = new Uint8Array(bin.buffer, bin.byteOffset + (view.byteOffset ?? 0), view.byteLength).slice();
  return { bytes, mime: image.mimeType ?? 'image/png' };
}

/**
 * Parse a GLB into one merged geometry with the plant attributes; `defaultKind` is for
 * non-leaves. With `ownLeaves` false the leaf cards are mapped into the procedural atlas.
 */
export function parseGlb(buffer: ArrayBuffer, defaultKind: number, ownLeaves = true): ParsedModel {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: DataView | null = null;
  while (offset + 8 <= dv.byteLength) {
    const len = dv.getUint32(offset, true);
    const type = dv.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len))) as GltfJson;
    else if (type === 0x004e4942) bin = new DataView(buffer, start, len);
    offset = start + len + ((4 - (len % 4)) % 4);
  }
  if (!json || !bin) throw new Error('GLB without JSON or BIN chunk');
  const g = json;
  const b = bin;
  // One leaf texture per model: the first masked material's. Its cards keep their own UVs.
  const leafMat = g.materials?.find((m) => m.alphaMode === 'MASK' && m.pbrMetallicRoughness?.baseColorTexture);
  const leafImage = ownLeaves ? baseImage(g, b, leafMat) : null;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const kind: number[] = [];
  const shade: number[] = [];
  const index: number[] = [];
  const m = new Matrix4();
  const nm = new Matrix4();
  const v = new Vector3();

  const visit = (nodeIndex: number, parent: Matrix4): void => {
    const node = g.nodes?.[nodeIndex];
    if (!node) return;
    const local = new Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else {
      const t = node.translation ?? [0, 0, 0];
      const r = node.rotation ?? [0, 0, 0, 1];
      const s = node.scale ?? [1, 1, 1];
      local.compose(new Vector3(t[0], t[1], t[2]), new Quaternion(r[0], r[1], r[2], r[3]), new Vector3(s[0], s[1], s[2]));
    }
    const world = parent.clone().multiply(local);
    if (node.mesh !== undefined) {
      for (const prim of g.meshes?.[node.mesh]?.primitives ?? []) {
        const p = prim.attributes['POSITION'];
        if (p === undefined) continue;
        const P = readAccessor(g, b, p);
        const at = (name: string): Float32Array | null => (prim.attributes[name] !== undefined ? readAccessor(g, b, prim.attributes[name]!) : null);
        const N = at('NORMAL');
        const T = at('TEXCOORD_0');
        const C = at('COLOR_0');
        const cw = C ? C.length / (P.length / 3) : 0;
        const mat = prim.material !== undefined ? g.materials?.[prim.material] : undefined;
        const cards = mat?.alphaMode === 'MASK';
        const leafy = cards || /leaf|leaves|foliage|needle|crown/i.test(mat?.name ?? '');
        const own = cards && leafImage !== null && mat === leafMat;
        const k = leafy ? 1 : defaultKind;
        const first = pos.length / 3;
        m.copy(world);
        nm.copy(world).invert().transpose();
        for (let i = 0; i < P.length / 3; i++) {
          v.set(P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!).applyMatrix4(m);
          pos.push(v.x, v.y, v.z);
          if (N) v.set(N[i * 3]!, N[i * 3 + 1]!, N[i * 3 + 2]!).applyMatrix4(nm).normalize();
          else v.set(0, 1, 0);
          nor.push(v.x, v.y, v.z);
          // Leaves without their own texture sample the procedural atlas: alpha cards its
          // broad-leaf cell, solid leaves the dense cell's opaque middle.
          if (own && T) uv.push(T[i * 2]!, T[i * 2 + 1]!);
          else if (cards && T) uv.push((T[i * 2]! % 1) * 0.5, 0.5 + (T[i * 2 + 1]! % 1) * 0.5);
          else if (leafy) uv.push(0.75, 0.25);
          else uv.push(T ? T[i * 2]! : 0, T ? T[i * 2 + 1]! : 0);
          kind.push(k);
          // Vertex colour, where the artist baked one, is the occlusion inside the crown.
          shade.push(C ? (C[i * cw]! + C[i * cw + 1]! + C[i * cw + 2]!) / 3 : -1);
        }
        if (prim.indices !== undefined) for (const i of readAccessor(g, b, prim.indices)) index.push(first + i);
        else for (let i = 0; i < P.length / 3; i++) index.push(first + i);
      }
    }
    for (const c of node.children ?? []) visit(c, world);
  };
  const roots = g.scenes?.[g.scene ?? 0]?.nodes ?? (g.nodes ?? []).map((_, i) => i);
  for (const r of roots) visit(r, new Matrix4());
  if (pos.length === 0) throw new Error('GLB has no meshes');

  let top = 1e-3;
  for (let i = 1; i < pos.length; i += 3) top = Math.max(top, pos[i]!);
  const count = pos.length / 3;
  const shell = bendLeafNormals(pos, nor, kind);
  const ao = new Float32Array(count);
  const flex = new Float32Array(count);
  const rand = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const h = Math.max(0, pos[i * 3 + 1]!) / top;
    // Baked occlusion is softened: crowns read dark grey from afar when it is used at full depth.
    const baked = shade[i]! >= 0 ? 0.45 + 0.55 * shade[i]! : 0.55 + 0.45 * h;
    // A crown is one mass: leaves deep inside it and on its underside sit in its own shade.
    const s = shell[i]!;
    const under = nor[i * 3 + 1]! * 0.5 + 0.5;
    ao[i] = kind[i] === 1 ? baked * (0.5 + 0.5 * s) * (0.78 + 0.22 * under) : baked;
    flex[i] = kind[i] === 1 ? 0.35 + 0.65 * h * h : 0.6 * h * h;
    // Stable per-region random, so leaves fall in patches rather than per vertex.
    rand[i] = Math.abs(Math.sin(Math.floor(pos[i * 3]! * 2) * 12.9898 + Math.floor(pos[i * 3 + 2]! * 2) * 78.233 + Math.floor(pos[i * 3 + 1]! * 2) * 37.719) * 43758.5453) % 1;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geo.setAttribute('aKind', new BufferAttribute(new Float32Array(kind), 1));
  geo.setAttribute('aAO', new BufferAttribute(ao, 1));
  geo.setAttribute('aFlex', new BufferAttribute(flex, 1));
  geo.setAttribute('aRand', new BufferAttribute(rand, 1));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return { geometry: geo, leafImage };
}

/**
 * Point leaf normals out of the crown (as the procedural trees do): flat cards lit one by one
 * read as a pile of paper; normals bent out of one ellipsoid light the crown as a soft mass with
 * a sunlit side and a shaded side.
 */
function bendLeafNormals(pos: number[], nor: number[], kind: number[]): Float32Array {
  const shell = new Float32Array(kind.length).fill(1);
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < kind.length; i++) {
    if (kind[i] !== 1) continue;
    for (let c = 0; c < 3; c++) {
      lo[c] = Math.min(lo[c]!, pos[i * 3 + c]!);
      hi[c] = Math.max(hi[c]!, pos[i * 3 + c]!);
    }
  }
  if (!(hi[0]! > lo[0]!)) return shell;
  const half = [0, 1, 2].map((c) => Math.max((hi[c]! - lo[c]!) / 2, 0.1));
  const mid = [0, 1, 2].map((c) => (hi[c]! + lo[c]!) / 2);
  const v = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < kind.length; i++) {
    if (kind[i] !== 1) continue;
    v.set((pos[i * 3]! - mid[0]!) / half[0]!, (pos[i * 3 + 1]! - mid[1]!) / half[1]!, (pos[i * 3 + 2]! - mid[2]!) / half[2]!);
    shell[i] = Math.min(1, v.length());
    if (v.lengthSq() < 1e-6) v.set(0, 1, 0);
    n.set(nor[i * 3]!, nor[i * 3 + 1]!, nor[i * 3 + 2]!);
    // Cards facing inwards would cancel the bend; only their tilt is kept. Almost all of the
    // normal is the crown's: lit card by card, a tree reads as a heap of paper.
    if (n.dot(v) < 0) n.negate();
    v.normalize().multiplyScalar(0.88).addScaledVector(n, 0.12).normalize();
    nor[i * 3] = v.x;
    nor[i * 3 + 1] = v.y;
    nor[i * 3 + 2] = v.z;
  }
  return shell;
}

/** Decode an embedded image into a texture laid out the glTF way (no flip). */
async function decodeLeaf(image: NonNullable<ParsedModel['leafImage']>): Promise<{ map: Texture; norm: number } | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const blob = new Blob([image.bytes as BlobPart], { type: image.mime });
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const map = new Texture(bitmap);
  map.flipY = false;
  map.colorSpace = SRGBColorSpace;
  map.minFilter = LinearMipmapLinearFilter;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return { map, norm: textureNorm(bitmap) };
}

/** The height the procedural plant of a species is built to, so models fit the same layout. */
function speciesHeight(species: SpeciesId): number {
  const g = plantGeometry(species, 1, 1);
  g.computeBoundingBox();
  const h = g.boundingBox ? g.boundingBox.max.y : 1;
  g.dispose();
  return Math.max(h, 0.1);
}

/**
 * Load the plant models the manifest lists, for `only` these species (all when omitted): a river
 * fetches just the plants its banks grow. Keys are `${species}:${lod}`. Never rejects.
 */
export async function loadPlantModels(only?: ReadonlySet<SpeciesId>): Promise<Map<string, PlantModel>> {
  const out = new Map<string, PlantModel>();
  // Two species may share a model: fetch each file once.
  const files = new Map<ModelId, Promise<ArrayBuffer>>();
  const fetchOnce = (id: ModelId): Promise<ArrayBuffer> => {
    let p = files.get(id);
    if (!p) {
      p = fetch(modelUrl(id)).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      });
      files.set(id, p);
    }
    return p;
  };
  // Boulders come in three shapes: the second and third are keyed `rock#1`, `rock#2`.
  const entries: [string, SpeciesId, ModelId][] = [];
  for (const [name, id] of Object.entries(SPECIES_MODEL)) if (id) entries.push([name, name as SpeciesId, id]);
  entries.push(['rock#1', 'rock', 'rock-b'], ['rock#2', 'rock', 'rock-c']);
  const jobs = entries.map(async ([key, species, id]) => {
    if (!hasModel(id) || (only && !only.has(species))) return;
    try {
      const kind = species === 'rock' ? 3 : species === 'reeds' ? 2 : 0;
      const buffer = await fetchOnce(id);
      let parsed = parseGlb(buffer, kind);
      const leaf = parsed.leafImage ? await decodeLeaf(parsed.leafImage).catch(() => null) : null;
      // An undecodable leaf image: map the cards into the procedural atlas instead.
      if (parsed.leafImage && !leaf) {
        parsed.geometry.dispose();
        parsed = parseGlb(buffer, kind, false);
      }
      const geometry = parsed.geometry;
      geometry.computeBoundingBox();
      const top = geometry.boundingBox ? geometry.boundingBox.max.y : 0;
      if (top > 0.05) {
        const s = speciesHeight(species) / top;
        geometry.scale(s, s, s);
        geometry.computeBoundingSphere();
      }
      const model: PlantModel = { geometry, leafMap: leaf?.map ?? null, leafNorm: leaf?.norm ?? 1 };
      out.set(`${key}:0`, model);
      out.set(`${key}:1`, model);
    } catch (err) {
      log.warn('world', `model ${id} unreadable; using the procedural plant`, err);
    }
  });
  await Promise.all(jobs);
  return out;
}
