/**
 * Names of every art asset the code may ask for, and the manifest that says which ones exist.
 * Assets live in public/assets and are produced with Blender (see docs/ARCHITECTURE.md). A loader
 * must always cope with a missing asset: check `has()` and fall back to a flat colour or a proxy.
 */
import type { ActorKind, StoneId } from './types';
import { log } from './log';

/** A PBR texture set: `<base>_col.webp`, `<base>_nor.webp` (OpenGL normals), `<base>_arm.webp` (AO, roughness, metal). */
export type TextureSetId =
  | `stone-${StoneId}`
  | 'timber' //        weathered construction timber
  | 'paving' //        cobbled deck
  | 'ground-rock'
  | 'ground-soil'
  | 'ground-grass'
  | 'ground-gravel'
  | 'ground-sand'
  | 'ground-mud'
  | 'cliff-tuff'
  | 'cliff-basalt'
  | 'cliff-limestone'
  | 'moss'
  | 'bark';

export type ModelId =
  | 'tree-poplar'
  | 'tree-willow'
  | 'tree-oak'
  | 'tree-plane'
  | 'tree-spruce'
  | 'bush'
  | 'reeds'
  | 'rock-a'
  | 'rock-b'
  | 'rock-c'
  | 'driftwood'
  | `actor-${ActorKind}`
  | 'actor-ox'
  | 'actor-camel'
  | 'actor-horse';

interface Manifest {
  readonly textures: readonly string[];
  readonly models: readonly string[];
}

let manifest: Manifest = { textures: [], models: [] };
let loaded = false;

const base = (): string => `${import.meta.env.BASE_URL}assets/`;

/** Fetch the manifest once at boot. Never rejects: with no manifest every asset counts as missing. */
export async function loadManifest(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const res = await fetch(`${base()}manifest.json`, { cache: 'no-cache' });
    if (res.ok) manifest = (await res.json()) as Manifest;
  } catch (err) {
    log.warn('assets', 'no manifest; using fallbacks', err);
  }
}

export function hasTexture(id: TextureSetId): boolean {
  return manifest.textures.includes(id);
}

export function hasModel(id: ModelId): boolean {
  return manifest.models.includes(id);
}

export function textureUrls(id: TextureSetId): { color: string; normal: string; arm: string } {
  const b = `${base()}tex/${id}`;
  return { color: `${b}_col.webp`, normal: `${b}_nor.webp`, arm: `${b}_arm.webp` };
}

export function modelUrl(id: ModelId): string {
  return `${base()}models/${id}.glb`;
}

/** For harness pages and tests. */
export function setManifestForTesting(m: Manifest): void {
  manifest = m;
  loaded = true;
}
