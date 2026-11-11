/**
 * Fair warning (SIM-SPEC section 10), on every river: a bridge left alone that falls to something
 * slow (weathering, everyday traffic on worn joints, settlement, creeping scour) has had the şakül
 * trembling for at least fifteen years. Sudden causes may strike unannounced: a great flood (a
 * 25-year return period or more), an earthquake, an exceptional load, the striking of the centering.
 * A bridge that trembles from its first year has been warned as early as it could be.
 */
import { describe, expect, it } from 'vitest';
import type { BridgeDesign, CollapseInfo, LevelDef } from '../core/types';
import { createSim, returnPeriod } from '../sim/index';
import { LEVELS } from './index';
import { FACTS } from './tuning/facts';
import { designOf, spaceOf } from './tuning/space';

const sim = createSim();
/** Years of warning a slow fall must give. */
const LEAD = 15;
/** A flood this rare may take a bridge without warning (the director announces it instead). */
const GREAT_FLOOD_T = 25;

/** The design thickened until its centering can be struck: a bridge that has a chronicle at all. */
function standing(level: LevelDef, design: BridgeDesign): BridgeDesign {
  let d = sim.normalize(level, design);
  for (let i = 0; i < 40 && !sim.strike(level, d).stands; i++) {
    d = sim.normalize(level, { ...d, spans: d.spans.map((s) => ({ ...s, thickness: s.thickness + 0.05 })) });
  }
  return d;
}

/** The starter, rings from thin to thick, the recorded designs, and a shallow foundation. */
function spread(level: LevelDef): [string, BridgeDesign][] {
  const starter = standing(level, level.starter);
  const out: [string, BridgeDesign][] = [['starter', starter]];
  const [lo, hi] = level.limits.thickness;
  for (const k of [0, 0.25, 0.5, 0.75]) {
    const t = lo + (hi - lo) * k;
    out.push([`ring ${t.toFixed(2)} m`, standing(level, { ...starter, spans: starter.spans.map((s) => ({ ...s, thickness: t })) })]);
  }
  const fact = FACTS.find((f) => f.id === level.id);
  if (fact) {
    out.push(['recorded pass', standing(level, designOf(spaceOf(level), fact.pass))]);
    if (fact.master) out.push(['recorded master', standing(level, designOf(spaceOf(level), fact.master))]);
  }
  if (starter.piers.length > 0) out.push(['shallow foundation', standing(level, { ...starter, foundation: level.limits.foundation[0] })]);
  return out;
}

/** A fall nothing could announce: a hazard, the centering, the stone crushed, or a great flood that year. */
function sudden(collapse: CollapseInfo, floodThatYear: number): boolean {
  if (collapse.hazard || collapse.cause === 'strike' || collapse.cause === 'crushing' || collapse.cause === 'quake') return true;
  return (collapse.cause === 'flood-wash' || collapse.cause === 'flood-scour') && floodThatYear >= GREAT_FLOOD_T;
}

let slowFalls = 0;

describe('fair warning', () => {
  it.each(LEVELS.map((l) => [l.id, l] as const))(
    '%s: every slow fall is announced fifteen years ahead',
    (_id, level) => {
      const late: string[] = [];
      for (const [name, design] of spread(level)) {
        let warned: number | null = null;
        let collapse: CollapseInfo | null = null;
        let flood = { year: -Infinity, period: 0 };
        for (const e of sim.run(level, design).advance(level.endYear)) {
          if (e.kind === 'warning') warned ??= e.year;
          if (e.kind === 'flood') flood = { year: e.year, period: returnPeriod(level, e.stage) };
          if (e.kind === 'collapse') collapse = e.info;
        }
        if (!collapse || sudden(collapse, flood.year === collapse.year ? flood.period : 0)) continue;
        slowFalls++;
        const ok = warned !== null && (collapse.year - warned >= LEAD || warned <= Math.floor(level.year) + 1);
        if (!ok) late.push(`${name}: ${collapse.year} ${collapse.cause}, warned ${warned ?? 'never'}`);
      }
      expect(late).toEqual([]);
    },
    120_000,
  );

  it('the rivers above bring slow falls to judge', () => {
    expect(slowFalls).toBeGreaterThanOrEqual(LEVELS.length);
  });
});
