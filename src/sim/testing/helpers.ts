/** Small helpers shared by the test files. */
import type { SimApi } from '../../core/contracts';
import type { BridgeDesign, ChronicleEvent, LevelDef } from '../../core/types';

export const clone = (d: BridgeDesign): BridgeDesign => JSON.parse(JSON.stringify(d)) as BridgeDesign;

/** The starter design of a level with a change applied. */
export function withSpans(level: LevelDef, change: (d: BridgeDesign) => void): BridgeDesign {
  const d = clone(level.starter);
  change(d);
  return d;
}

/** Run a design to its end in `steps` equal steps; everything that can be compared afterwards. */
export function runAll(sim: SimApi, level: LevelDef, design: BridgeDesign, steps: number): { events: ChronicleEvent[]; state: unknown; summary: unknown } {
  const run = sim.run(level, design);
  const events: ChronicleEvent[] = [];
  const span = level.endYear - level.year;
  for (let i = 1; i <= steps && !run.ended; i++) events.push(...run.advance(level.year + (span * i) / steps));
  events.push(...run.advance(level.endYear));
  return { events, state: JSON.parse(JSON.stringify(run.state)), summary: run.summary() };
}
