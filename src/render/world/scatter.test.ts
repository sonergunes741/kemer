import { describe, expect, it } from 'vitest';
import { fixtureSite } from '../../../harness/worldFixtures';
import { BIOMES } from './biomes';
import { createTerrainField } from './ground';
import { scatterPlants, type ScatterInput } from './scatter';

function input(): ScatterInput {
  const site = fixtureSite('green-valley').site;
  const field = createTerrainField(site, BIOMES['green-valley'].relief, site.seed);
  return {
    field,
    rules: BIOMES['green-valley'].plants,
    seed: site.seed,
    flood: 1.5,
    bridge: { x0: site.left, x1: site.right, halfWidth: site.width / 2 },
    limit: 6000,
  };
}

describe('scatter', () => {
  it('grows the same valley from the same seed', () => {
    const a = scatterPlants(input());
    const b = scatterPlants(input());
    expect(a.length).toBeGreaterThan(50);
    expect(b).toEqual(a);
  });

  it('keeps the road and the bridge clear and respects the cap', () => {
    const inp = input();
    const plants = scatterPlants(inp);
    const hw = inp.bridge.halfWidth;
    for (const p of plants) {
      expect(Math.abs(p.z)).toBeGreaterThanOrEqual(hw + 3.5);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    expect(scatterPlants({ ...inp, limit: 40 }).length).toBeLessThanOrEqual(40);
  });

  it('sorts by priority so a quality cut keeps a fair sample', () => {
    const plants = scatterPlants(input());
    for (let i = 1; i < plants.length; i++) expect(plants[i]!.priority).toBeGreaterThanOrEqual(plants[i - 1]!.priority);
  });
});
