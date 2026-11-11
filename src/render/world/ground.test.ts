import { describe, expect, it } from 'vitest';
import type { BiomeId } from '../../core/types';
import { fixtureSite } from '../../../harness/worldFixtures';
import { BIOMES } from './biomes';
import { createTerrainField } from './ground';

const CASES: [BiomeId, 'stream' | 'river' | 'wide'][] = [
  ['tuff-valley', 'stream'],
  ['steppe-river', 'river'],
  ['green-valley', 'wide'],
];

describe('terrain field', () => {
  for (const [biome, key] of CASES) {
    it(`${biome}: the ground under the bridge is exactly the site's ground line`, () => {
      const site = fixtureSite(biome, key).site;
      const field = createTerrainField(site, BIOMES[biome].relief, site.seed);
      for (const z of [-site.width / 2, 0, site.width / 2]) {
        for (const p of site.ground) expect(field.height(p.x, z)).toBeCloseTo(p.y, 9);
      }
      // Between the breaks too: the profile is linear there.
      const a = site.ground[1]!;
      const b = site.ground[2]!;
      const mx = (a.x + b.x) / 2;
      expect(field.height(mx, 0)).toBeCloseTo((a.y + b.y) / 2, 9);
    });

    it(`${biome}: the landscape is free away from the bridge and finite everywhere`, () => {
      const site = fixtureSite(biome, key).site;
      const field = createTerrainField(site, BIOMES[biome].relief, site.seed);
      let differs = false;
      for (let i = 0; i < 40; i++) {
        const x = site.ground[0]!.x + (i / 39) * (site.ground[site.ground.length - 1]!.x - site.ground[0]!.x);
        const z = 300;
        const h = field.height(x, z);
        expect(Number.isFinite(h)).toBe(true);
        if (Math.abs(h - field.profile(x)) > 0.05) differs = true;
      }
      expect(differs).toBe(true);
      expect(field.riverWidth).toBeGreaterThan(1);
      expect(field.extent).toBeGreaterThanOrEqual(4200);
    });
  }
});
