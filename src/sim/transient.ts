/**
 * Transient loads on the whole bridge (SIM-SPEC sections 5 and 6): the earthquake and axle
 * capacities with the piers free to respond, and the hinges of the mechanisms they end in.
 */
import type { Hinge } from '../core/types';
import type { BridgeModel } from './bridge';
import { setAxle } from './loads';
import { completeMechanism } from './mechanism';
import { hingesOf } from './rows';

/** Spans that fail first (with the hinges of their mechanism) and piers that fail first. */
export interface Mechanism {
  spans: Map<number, Hinge[]>;
  piers: number[];
}

/**
 * Hinges of every span of the last window at its solution, and the piers at their limit. `must`
 * names a span that is part of the mechanism whenever no pier is (the one under the axle).
 * Every span reported comes with a full mechanism (see mechanism.ts); that needs the transient
 * load still applied, and it clobbers the LP workspace.
 */
function readMechanism(model: BridgeModel, dir: number, spans: Map<number, Hinge[]>, piers: number[], must = -1): void {
  const x = model.ws.lp.x;
  const lam = model.lamCol >= 0 ? (x[model.lamCol] as number) : 0;
  const { from, to, alpha, assemblyLaw } = model;
  let most = 0;
  const found: Hinge[][] = [];
  for (let i = from; i <= to; i++) {
    const col = model.col[i] as number;
    const h = hingesOf(model.spans[i]!, x[col] as number, x[col + 1] as number, x[col + 2] as number, lam, alpha, assemblyLaw);
    found.push(h);
    if (h.length > most) most = h.length;
  }
  for (let q = from; q < to; q++) {
    const st = model.pierState(q, true, true, dir);
    const N = st[0] as number;
    const wb = (model.footing[q] as number) / model.L;
    const tipping = Math.abs(st[2] as number) >= (wb / 2) * N * (1 - 1e-6);
    const sliding = Math.abs(st[1] as number) >= (model.baseMu[q] as number) * N * (1 - 1e-6);
    if (tipping || sliding) piers.push(q);
  }
  // A span with three or more hinges is part of the mechanism; failing that, the most hinged one.
  const need = piers.length > 0 ? 3 : Math.min(3, most);
  for (let i = from; i <= to; i++) {
    const h = found[i - from]!;
    if (!(h.length >= need && h.length > 0) && !(i === must && piers.length === 0)) continue;
    const sp = model.spans[i]!;
    // A span beside a pier at its limit moves with that pier; the load only acts where it was put.
    const towards = (piers.includes(i) ? 1 : 0) - (piers.includes(i - 1) ? 1 : 0);
    const loaded = sp.endLx !== 0 || sp.endLy !== 0;
    spans.set(i, completeMechanism(model.ws, sp, assemblyLaw, h, loaded ? lam : 0, alpha, towards));
  }
}

/**
 * Horizontal acceleration (fraction of g) that turns an arch or a pier into a mechanism, the
 * weaker direction. Optionally reports that mechanism.
 */
export function quakeCapacity(model: BridgeModel, mechanism?: Mechanism): number {
  let worst = Infinity;
  for (const dir of [1, -1]) {
    for (const sp of model.spans) sp.setQuake(dir);
    model.assemble(0, model.count - 1, true, true, -1, 1, 0, dir, false);
    const status = model.solveWindow('lambda', 'cold');
    const lam = status === 'infeasible' ? 0 : status === 'unbounded' ? Infinity : Math.max(0, model.ws.lp.x[model.lamCol] as number);
    if (lam < worst) {
      worst = lam;
      if (mechanism && status === 'optimal') {
        mechanism.spans.clear();
        mechanism.piers.length = 0;
        readMechanism(model, dir, mechanism.spans, mechanism.piers);
      }
    }
  }
  for (const sp of model.spans) sp.clearSecond();
  return worst;
}

/**
 * Largest axle (kN) at x on span i, with the neighbouring spans and their piers free to respond.
 * `length` and `width` are the axle's footprint. Optionally reports the mechanism.
 */
export function axleCapacityAt(model: BridgeModel, i: number, x: number, length: number, width: number, mechanism?: Mechanism): number {
  const from = Math.max(0, i - 1);
  const to = Math.min(model.count - 1, i + 1);
  for (let k = from; k <= to; k++) model.spans[k]!.clearSecond();
  setAxle(model.spans[i]!, x, length);
  model.assemble(from, to, true, true, -1, 1, 0, 0, false);
  const status = model.solveWindow('lambda', 'cold');
  let capacity: number;
  if (status === 'infeasible') capacity = 0;
  else if (status === 'unbounded') capacity = Infinity;
  else capacity = Math.max(0, model.ws.lp.x[model.lamCol] as number) * model.W * width;
  if (mechanism && status === 'optimal') {
    mechanism.spans.clear();
    mechanism.piers.length = 0;
    readMechanism(model, 0, mechanism.spans, mechanism.piers, i);
  }
  model.spans[i]!.clearSecond();
  return capacity;
}

/** The mechanism of a span under its dead load: where it gives when nothing else is known. */
export function deadMechanism(model: BridgeModel, i: number): Hinge[] {
  return completeMechanism(model.ws, model.spans[i]!, model.law, []);
}
