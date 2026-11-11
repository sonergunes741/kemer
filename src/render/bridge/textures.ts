/**
 * Texture sets for the bridge (the level's stone, paving, timber, moss), loaded on demand and
 * shared. A missing set resolves to null and the materials fall back to a flat colour.
 */
import { DataTexture, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, RepeatWrapping, SRGBColorSpace, Texture, TextureLoader, UnsignedByteType } from 'three';
import { hasTexture, textureUrls, type TextureSetId } from '../../core/assets';
import { log } from '../../core/log';

export interface TextureSet {
  readonly color: Texture;
  readonly normal: Texture;
  readonly arm: Texture;
}

const loader = new TextureLoader();

function prepare(tex: Texture, color: boolean): Texture {
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export class TextureCache {
  private readonly sets = new Map<TextureSetId, Promise<TextureSet | null>>();
  private readonly loaded: Texture[] = [];
  private disposed = false;

  get(id: TextureSetId): Promise<TextureSet | null> {
    let p = this.sets.get(id);
    if (!p) {
      p = this.load(id);
      this.sets.set(id, p);
    }
    return p;
  }

  private async load(id: TextureSetId): Promise<TextureSet | null> {
    if (!hasTexture(id)) return null;
    const urls = textureUrls(id);
    try {
      const [color, normal, arm] = await Promise.all([loader.loadAsync(urls.color), loader.loadAsync(urls.normal), loader.loadAsync(urls.arm)]);
      if (this.disposed) {
        color.dispose();
        normal.dispose();
        arm.dispose();
        return null;
      }
      this.loaded.push(color, normal, arm);
      return { color: prepare(color, true), normal: prepare(normal, false), arm: prepare(arm, false) };
    } catch (err) {
      log.once(`bridge-tex-${id}`, 'bridge', `texture set ${id} failed; flat colour instead`, err);
      return null;
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.loaded) t.dispose();
    this.loaded.length = 0;
    this.sets.clear();
  }
}

/** A 1 x 1 texture to keep samplers bound before (or without) the real ones. */
export function blankTexture(r: number, g: number, b: number): DataTexture {
  const t = new DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, RGBAFormat, UnsignedByteType);
  t.needsUpdate = true;
  return t;
}
