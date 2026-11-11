/**
 * The balance facts recorded in docs/BALANCE.md, checked against the real simulation: how each
 * starter falls, a design the balance script found that passes, one that earns all three seals,
 * and the bridge a careful player repairing at most four times stands to 2026 with, which the par
 * is set from. If the simulation changes, these fail first; rerun `npm run balance` and retune.
 */
import { describe, expect, it } from 'vitest';
import type { HazardDef, LevelDef } from '../core/types';
import { createSim } from '../sim/index';
import { LEVELS } from './index';
import { MILLENNIUM } from './millennium';
import { FACTS } from './tuning/facts';
import { CAREFUL_REPAIRS } from './tuning/search';
import { designOf, spaceOf } from './tuning/space';
import { fate, trial } from './tuning/trial';

const sim = createSim();
const byId = new Map<string, LevelDef>([...LEVELS, MILLENNIUM].map((l) => [l.id, l]));

function levelOf(id: string): LevelDef {
  const level = byId.get(id);
  if (!level) throw new Error(`no level ${id}`);
  return level;
}

describe('recorded balance facts', () => {
  it('cover every river and the thousand years', () => {
    expect(FACTS.map((f) => f.id).sort()).toEqual([...LEVELS.map((l) => l.id), 'millennium'].sort());
  });

  it.each(FACTS.map((f) => [f.id, f] as const))('%s: the starter falls as recorded', (_id, f) => {
    const level = levelOf(f.id);
    expect(fate(trial(sim, level, level.starter, 'none'))).toBe(f.starter);
  });

  it.each(FACTS.map((f) => [f.id, f] as const))('%s: a recorded design passes and validates', (_id, f) => {
    const level = levelOf(f.id);
    const design = sim.normalize(level, designOf(spaceOf(level), f.pass));
    expect(sim.validate(level, design)).toEqual([]);
    expect(trial(sim, level, design, 'none').summary.passed).toBe(true);
  });

  it.each(FACTS.filter((f) => f.master).map((f) => [f.id, f] as const))('%s: a recorded design earns all three seals', (_id, f) => {
    const level = levelOf(f.id);
    const design = sim.normalize(level, designOf(spaceOf(level), f.master!));
    const outcome = trial(sim, level, design, f.masterPolicy);
    expect(outcome.summary.seals).toEqual({ standing: true, lean: true, unrepaired: true });
    expect(outcome.summary.masterwork).toBe(true);
    expect(outcome.stones).toBe(f.masterStones);
  });

  it.each(FACTS.map((f) => [f.id, f] as const))('%s: a careful player who repairs at most four times earns the lean seal', (_id, f) => {
    const level = levelOf(f.id);
    const outcome = trial(sim, level, designOf(spaceOf(level), f.careful), f.carefulPolicy);
    expect(outcome.summary.seals.standing).toBe(true);
    expect(outcome.summary.repairs).toBeLessThanOrEqual(CAREFUL_REPAIRS);
    expect(outcome.summary.seals.lean).toBe(true);
    expect(outcome.stones).toBe(f.cheapestStanding);
  });

  it('par is 12 to 18 percent above the dearer of the careful bridge and the cheapest unrepaired one', () => {
    for (const f of FACTS) {
      const par = levelOf(f.id).parStones;
      const basis = Math.max(f.cheapestStanding, f.masterStones ?? 0);
      expect(par, f.id).toBeGreaterThanOrEqual(Math.floor(basis * 1.12));
      expect(par, f.id).toBeLessThanOrEqual(Math.ceil(basis * 1.18));
    }
  });
});

describe('great floods', () => {
  const largestNamed = (level: LevelDef): HazardDef | undefined =>
    level.hazards.filter((h) => h.kind === 'flood').reduce<HazardDef | undefined>((a, h) => (!a || (h.kind === 'flood' && a.kind === 'flood' && h.stage > a.stage) ? h : a), undefined);

  it.each(LEVELS.map((l) => [l.id, l] as const))('%s: the named great flood is the greatest the river sees', (_id, level) => {
    const named = largestNamed(level);
    expect(named).toBeDefined();
    expect(sim.greatestFlood(level).year).toBe(named!.year);
  });
});
