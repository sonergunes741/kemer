/**
 * Stability of the piers under dead load (SIM-SPEC section 6): the factor by which a pier's base
 * could shrink with the bridge still standing.
 *
 * "Base" means the base joint as a whole: its width (overturning, bearing) and its friction
 * (sliding) shrink together by 1/kappa. Scaling the width alone leaves a pier that must slide
 * without any answer, and that used to be read as "perfectly stable".
 */
import type { BridgeModel } from './bridge';
import { ALL_PIERS } from './bridge';
import { GSF_MAX_ROUNDS, GSF_TOL, LP_FEAS_TOL, PIER_STABILITY_CAP } from './tuning';

/**
 * The smallest kappa (base factor 1/kappa) at which the dead-load problem of the window still has
 * a solution, for one pier or for all piers of the window together. Same iteration as the alpha
 * search of a ring, started from `start`. Every row kappa scales carries the slack, so the search
 * only comes back with Infinity when the window has no state at all whatever this pier's base is:
 * a ring or another pier of the window cannot stand, or this pier is lifted off its base.
 */
function kappaSearch(model: BridgeModel, from: number, to: number, soft: number, start: number, known = Infinity): number {
  let kappa = start;
  // `known` is the kappa of the states already in model.found: only a better answer replaces them.
  let best = known;
  let weight = 1;
  for (let round = 0; round < GSF_MAX_ROUNDS; round++) {
    model.assemble(from, to, false, false, soft, kappa, weight, 0, round > 0);
    const status = model.solveWindow('slack', round === 0 ? 'crash' : 'warm');
    if (status !== 'optimal') break;
    const slack = model.ws.lp.x[model.sCol] as number;
    let need = 0;
    let nMin = Infinity;
    for (let q = from; q < to; q++) {
      if (soft !== ALL_PIERS && soft !== q) continue;
      need = Math.max(need, model.neededKappa(q));
      nMin = Math.min(nMin, model.state[0] as number);
    }
    if (need < best) {
      best = need;
      for (let i = from; i <= to; i++) {
        const col = model.col[i] as number;
        for (let k = 0; k < 3; k++) model.found[3 * i + k] = model.ws.lp.x[col + k] as number;
      }
    }
    if (need === Infinity) break;
    if (slack >= 0 && kappa - need <= GSF_TOL * kappa) break;
    if (need <= 1 / PIER_STABILITY_CAP) break;
    kappa = need;
    // Slack weight (wb/2) N keeps the slack in units of kappa: the next round lands almost exactly.
    const wb = (model.footing[soft === ALL_PIERS ? from : soft] as number) / model.L;
    weight = (wb / 2) * Math.max(nMin, 1e-3);
  }
  return best;
}

/**
 * Stability of every pier under dead load: the factor by which its base could shrink
 * (SIM-SPEC 6), capped. Needs the minimum-thrust state of every span (solveThrust at alpha = 1).
 *
 * A pier is first judged with its own two spans; if the answer leaves the piers next door
 * standing it is exact, otherwise the window grows to take them in. Windows are relaxations of
 * the whole bridge, so they can only flatter a pier: unless a state of the whole bridge has been
 * seen on the way, one LP over all of it has the last word. The guarantee is that no pier is
 * below 1 exactly when the dead-load problem of the whole bridge has a solution.
 */
export function pierStabilities(model: BridgeModel, out: number[]): void {
  const np = model.count - 1;
  const last = model.count - 1;
  const floor = 1 / PIER_STABILITY_CAP;
  out.length = np;
  let allFine = true;
  let ringsOk = true;
  for (const sp of model.spans) if (!sp.thrustOk) ringsOk = false;
  // `proven`: a state of the whole bridge that satisfies every ring and every pier is in hand.
  // First candidate: every span at its own minimum thrust.
  let proven = ringsOk;
  for (let q = 0; q < np && proven; q++) if (model.kappaFor(q, model.spans[q]!.thrustState, model.spans[q + 1]!.thrustState) > 1) proven = false;
  const found = model.found;
  for (let q = 0; q < np; q++) {
    const left = model.spans[q]!;
    const right = model.spans[q + 1]!;
    if (!left.thrustOk || !right.thrustOk) {
      // A ring next to it cannot stand, and the gsf of that span says so.
      out[q] = PIER_STABILITY_CAP;
      continue;
    }
    for (let k = 0; k < 3; k++) {
      found[3 * q + k] = left.thrustState[k] as number;
      found[3 * q + 3 + k] = right.thrustState[k] as number;
    }
    let kappa = model.kappaFor(q, left.thrustState, right.thrustState, true);
    if (!(kappa <= floor)) kappa = kappaSearch(model, q, q + 1, q, kappa === Infinity ? 1 : kappa, kappa);
    // Do the neighbours stand with these two spans as found and the outer spans at minimum thrust?
    let neighboursFine = kappa !== Infinity;
    if (neighboursFine && q > 0) {
      neighboursFine = model.spans[q - 1]!.thrustOk && model.kappaFor(q - 1, model.spans[q - 1]!.thrustState, found.subarray(3 * q, 3 * q + 3)) <= 1;
    }
    if (neighboursFine && q + 1 < np) {
      neighboursFine = model.spans[q + 2]!.thrustOk && model.kappaFor(q + 1, found.subarray(3 * q + 3, 3 * q + 6), model.spans[q + 2]!.thrustState) <= 1;
    }
    // The window (with the outer spans at minimum thrust when the neighbours are fine) is the whole bridge.
    let whole = np === 1 || (np === 2 && neighboursFine);
    if (!neighboursFine && np > 1) {
      const from = Math.max(0, q - 1);
      const to = Math.min(last, q + 2);
      const wide = kappaSearch(model, from, to, q, kappa === Infinity ? 1 : kappa);
      // No answer from the wide window means a neighbour fails by itself: keep the local answer.
      if (wide !== Infinity) {
        kappa = wide;
        whole = from === 0 && to === last;
      }
    }
    if (whole && kappa <= 1) proven = true;
    // Both rings stand and still no state at all: nothing can keep this pier on its base.
    out[q] = kappa === Infinity ? 0 : Math.min(PIER_STABILITY_CAP, 1 / kappa);
    if ((out[q] as number) < 1) allFine = false;
  }
  if (np >= 2 && allFine && ringsOk && !proven) {
    // Every pier passes in its own window, but no state of the whole bridge has been seen: ask.
    const kappa = kappaSearch(model, 0, last, ALL_PIERS, 1);
    if (kappa === Infinity) {
      // Every ring stands alone and the bridge has no state at any base size: the piers are the weak part.
      for (let q = 0; q < np; q++) out[q] = 0;
    } else if (kappa > 1 + LP_FEAS_TOL) {
      // The piers that are over their limit in the best compromise are the ones that give.
      for (let q = 0; q < np; q++) {
        const need = model.kappaFor(q, found.subarray(3 * q, 3 * q + 3), found.subarray(3 * q + 3, 3 * q + 6), true);
        if (need > 1 + LP_FEAS_TOL) out[q] = Math.min(out[q] as number, 1 / need);
      }
    }
  }
}
