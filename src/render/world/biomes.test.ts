import { describe, expect, it } from 'vitest';
import type { BiomeId } from '../../core/types';
import { BIOMES, WATER_LOOKS } from './biomes';
import { seasonLook } from './seasons';

const ALL: BiomeId[] = [
  'tuff-valley',
  'steppe-river',
  'green-valley',
  'basalt-plain',
  'limestone-gorge',
  'highland',
  'canyon',
  'rain-forest',
  'alluvial-plain',
  'flood-plain',
  'marsh',
];

describe('biomes', () => {
  it('defines all eleven biomes under their own ids', () => {
    expect(Object.keys(BIOMES).sort()).toEqual([...ALL].sort());
    for (const id of ALL) expect(BIOMES[id].id).toBe(id);
  });

  it('makes every biome a different place', () => {
    const looks = new Set(ALL.map((id) => `${BIOMES[id].grass.summer}:${BIOMES[id].rock[0]}:${BIOMES[id].relief.wall}`));
    expect(looks.size).toBe(ALL.length);
    for (const id of ALL) {
      const b = BIOMES[id];
      expect(b.plants.length).toBeGreaterThan(0);
      expect(b.haze.density).toBeGreaterThan(0);
      expect(b.rockSlope[0]).toBeLessThan(b.rockSlope[1]);
    }
  });

  it('has a water look for every tint', () => {
    for (const tint of ['green', 'red', 'brown', 'turquoise', 'milky', 'clear'] as const) expect(WATER_LOOKS[tint].absorb).toBeGreaterThan(0);
  });
});

describe('seasons', () => {
  const cold = { winter: 0.8, wet: 0.5, arid: 0.2 };
  it('winter brings snow and bare trees, summer neither', () => {
    const w = seasonLook(0.03, cold);
    const s = seasonLook(0.55, cold);
    expect(w.snow).toBeGreaterThan(0.3);
    expect(w.leaf).toBeLessThan(0.05);
    expect(s.snow).toBe(0);
    expect(s.leaf).toBeCloseTo(1, 3);
  });

  it('grass weights always sum to one, across New Year too', () => {
    for (let s = 0; s < 1; s += 0.01) {
      const l = seasonLook(s, cold);
      expect(l.spring + l.summer + l.fall + l.winter).toBeCloseTo(1, 6);
    }
  });

  it('mild winters bring less snow', () => {
    expect(seasonLook(0.03, { winter: 0.1, wet: 0.5, arid: 0.2 }).snow).toBeLessThan(seasonLook(0.03, cold).snow);
  });
});
