/**
 * The five stones and five soils. Masonry values, not intact rock: strengths are those of
 * dressed-stone masonry in lime mortar, several times below the stone itself
 * (docs/research/notes.md, "Material data"). Tuff is light, weak and weathers fast; basalt is
 * heavy, strong and lasts.
 */
import type { SiteDef, SoilId, SoilMaterial, StoneId, StoneMaterial } from '../core/types';

export const STONES: Readonly<Record<StoneId, StoneMaterial>> = {
  tuff: {
    id: 'tuff',
    name: { tr: 'Tüf', en: 'Tuff' },
    unitWeight: 17,
    strength: 3000,
    friction: 0.6,
    weathering: 0.00045,
    blockLength: 0.6,
    blockHeight: 0.3,
  },
  andesite: {
    id: 'andesite',
    name: { tr: 'Andezit', en: 'Andesite' },
    unitWeight: 24,
    strength: 10000,
    friction: 0.65,
    weathering: 0.00022,
    blockLength: 0.55,
    blockHeight: 0.32,
  },
  limestone: {
    id: 'limestone',
    name: { tr: 'Kireçtaşı', en: 'Limestone' },
    unitWeight: 25,
    strength: 9000,
    friction: 0.65,
    weathering: 0.00018,
    blockLength: 0.6,
    blockHeight: 0.35,
  },
  basalt: {
    id: 'basalt',
    name: { tr: 'Bazalt', en: 'Basalt' },
    unitWeight: 28,
    strength: 18000,
    friction: 0.7,
    weathering: 0.00008,
    blockLength: 0.5,
    blockHeight: 0.3,
  },
  granite: {
    id: 'granite',
    name: { tr: 'Granit', en: 'Granite' },
    unitWeight: 26.5,
    strength: 22000,
    friction: 0.7,
    weathering: 0.00006,
    blockLength: 0.7,
    blockHeight: 0.4,
  },
};

/**
 * Soils. `scour` and `yielding` are game-scale values. HEC-18 gives the equilibrium hole in a sand
 * bed, of the order of one to two pier widths whatever the flood; the factor stands for armouring
 * and for floods being short, and is set so foundations of about half a pier width in gravel
 * survive ordinary floods but not a great one carrying driftwood. `yielding` (metres of abutment
 * movement per kN/m of thrust at infinite time) is set so a flat arch between clay banks opens by
 * a few per cent of its span.
 */
export const SOILS: Readonly<Record<SoilId, SoilMaterial>> = {
  rock: { id: 'rock', name: { tr: 'Kaya', en: 'Rock' }, bearing: 5000, scour: 0.02, yielding: 0, friction: 0.7 },
  gravel: { id: 'gravel', name: { tr: 'Çakıl', en: 'Gravel' }, bearing: 600, scour: 0.25, yielding: 0.00006, friction: 0.55 },
  sand: { id: 'sand', name: { tr: 'Kum', en: 'Sand' }, bearing: 650, scour: 0.45, yielding: 0.0002, friction: 0.5 },
  clay: { id: 'clay', name: { tr: 'Kil', en: 'Clay' }, bearing: 200, scour: 0.3, yielding: 0.0007, friction: 0.35 },
  marsh: { id: 'marsh', name: { tr: 'Bataklık', en: 'Marsh' }, bearing: 90, scour: 0.55, yielding: 0.0012, friction: 0.25 },
};

/** Soil at a point of the bridge axis (rock where no zone covers it). */
export function soilAt(site: SiteDef, x: number): SoilId {
  for (const zone of site.soils) {
    if (x >= zone.from && x <= zone.to) return zone.soil;
  }
  return 'rock';
}

/** Ground elevation at x: the site polyline, flat beyond its ends. */
export function groundAt(site: SiteDef, x: number): number {
  const g = site.ground;
  const n = g.length;
  if (n === 0) return 0;
  const first = g[0]!;
  if (x <= first.x) return first.y;
  for (let i = 1; i < n; i++) {
    const p = g[i]!;
    if (x <= p.x) {
      const q = g[i - 1]!;
      const dx = p.x - q.x;
      return dx > 0 ? q.y + ((p.y - q.y) * (x - q.x)) / dx : p.y;
    }
  }
  return g[n - 1]!.y;
}
