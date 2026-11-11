/**
 * The simulation module: pure engineering, no DOM, no three.js (see docs/SIM-SPEC.md).
 * `createSim()` is the only thing the game needs; the rest is exported for tests and the harness.
 */
import type { ChronicleRun, SimApi } from '../core/contracts';
import { log } from '../core/log';
import type { BridgeDesign, BridgeGeometry, Capacities, DesignIssue, Insight, LevelDef, StrikeResult } from '../core/types';
import type { Analysis } from './analysis';
import { analysisOf } from './analysis';
import { Run } from './chronicle';
import { normalize } from './design';
import { SOILS, STONES } from './materials';
import { validate } from './validate';
import { floodSeries, floodStage } from './water';

/** The analysis of whatever design comes in (normalized first, so bad numbers cannot reach the solvers). */
function analyse(level: LevelDef, design: BridgeDesign): Analysis {
  return analysisOf(level, normalize(level, design));
}

/** Last line of defence for "never throw from the public API": retry once on the level's starter design. */
function guarded<T>(what: string, level: LevelDef, run: (analysis: Analysis) => T, design: BridgeDesign): T {
  try {
    return run(analyse(level, design));
  } catch (error) {
    log.once(`sim-${what}`, 'sim', `${what} failed; falling back to the starter design`, error);
    return run(analyse(level, level.starter));
  }
}

export function createSim(): SimApi {
  return {
    stones: STONES,
    soils: SOILS,
    normalize,
    validate,
    geometry(level, design): BridgeGeometry {
      return guarded('geometry', level, (a) => a.geometry(), design);
    },
    insight(level, design): Insight {
      return guarded('insight', level, (a) => a.insight(design), design);
    },
    capacities(level, design): Capacities {
      return guarded('capacities', level, (a) => a.capacities(), design);
    },
    strike(level, design): StrikeResult {
      return guarded('strike', level, (a) => a.strike(), design);
    },
    run(level, design): ChronicleRun {
      return guarded('run', level, (a) => new Run(a), design);
    },
    floodStage,
    greatestFlood(level): { year: number; stage: number } {
      const g = floodSeries(level).greatest;
      return { year: g.year, stage: g.stage };
    },
  };
}

/** Issues of a design, for callers that only have the functions (same as SimApi.validate). */
export function issuesOf(level: LevelDef, design: BridgeDesign): DesignIssue[] {
  return validate(level, design);
}

export { Analysis, analysisOf } from './analysis';
export { archShape, extradosY, intradosY, spanGeometry } from './arch';
export type { ArchShape } from './arch';
export { BridgeModel } from './bridge';
export { Run, floodDrama } from './chronicle';
export { normalize } from './design';
export { buildLayout, countStones, deckAt } from './geometry';
export type { Layout } from './geometry';
export { LpProblem, LpSolver, solveDenseLp } from './lp';
export { SOILS, STONES, groundAt, soilAt } from './materials';
export { solveMovement, spreadCapacity } from './movement';
export { Workspace, gsfOf, solveAlpha, solveMultiplier, solveThrust } from './ring';
export { hingesOf, thrustLine } from './rows';
export { RIGID, SpanModel } from './span';
export { validate } from './validate';
export { Waterway, floodSeries, floodStage, naturalDischarge, naturalVelocity, pierScourDepth, returnPeriod } from './water';
