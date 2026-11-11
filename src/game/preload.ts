/**
 * Warming what the next river will ask for while the player reads the result: its stone and its
 * banks' textures go into the browser's cache (and the service worker's, in production), so the
 * arrival does not wait on the network. Fire and forget; a failure only means a slower arrival.
 */
import { hasTexture, textureUrls, type TextureSetId } from '../core/assets';
import type { BiomeId, LevelDef } from '../core/types';

const warmed = new Set<string>();

/** The cliff texture the landscape picks for a biome (render/world/landscape.ts). */
function cliffOf(biome: BiomeId): TextureSetId {
  if (biome === 'basalt-plain' || biome === 'canyon') return 'cliff-basalt';
  if (biome === 'tuff-valley') return 'cliff-tuff';
  return 'cliff-limestone';
}

export function prefetchLevel(level: LevelDef): void {
  if (typeof fetch !== 'function') return;
  const sets: TextureSetId[] = [`stone-${level.stone}`, cliffOf(level.env.biome)];
  for (const id of sets) {
    if (!hasTexture(id)) continue;
    for (const url of Object.values(textureUrls(id))) {
      if (warmed.has(url)) continue;
      warmed.add(url);
      const init: RequestInit & { priority?: 'low' | 'high' | 'auto' } = { priority: 'low' };
      fetch(url, init).catch(() => warmed.delete(url));
    }
  }
}
