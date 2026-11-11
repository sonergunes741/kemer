/**
 * Progressive collapse (SIM-SPEC section 6): when a span falls, the piers beside it are left with
 * thrust from one side only. A pier that cannot hold that goes over and takes the next span with
 * it, one step (COLLAPSE_STEP_DELAY seconds) further out each time, until what remains stands.
 */
import type { Hinge, SpanCollapse } from '../core/types';
import type { BridgeModel } from './bridge';
import { supportMechanism } from './mechanism';
import type { Mechanism } from './transient';
import { COLLAPSE_STEP_DELAY } from './tuning';

export interface Fall {
  spans: SpanCollapse[];
  piers: number[];
}

/**
 * +1 when the part between the first two hinges turns clockwise. A hinge on the extrados opens
 * the joint at the intrados, turning the stones beyond it anticlockwise (and the reverse).
 */
function senseOf(hinges: readonly Hinge[]): 1 | -1 {
  return hinges.length > 0 && hinges[0]!.side === 'intrados' ? 1 : -1;
}

export function collapseFrom(model: BridgeModel, first: Mechanism): Fall {
  const count = model.count;
  const delay = new Array<number>(count).fill(-1);
  const hinges = new Array<Hinge[] | null>(count).fill(null);
  const pierDown = new Array<boolean>(Math.max(0, count - 1)).fill(false);
  for (const [i, h] of first.spans) {
    if (i < 0 || i >= count) continue;
    delay[i] = 0;
    hinges[i] = h;
  }
  for (const q of first.piers) if (q >= 0 && q < count - 1) pierDown[q] = true;

  // Each sweep moves the failure one support further out.
  for (let sweep = 0; sweep < count + 1; sweep++) {
    let changed = false;
    const before = delay.slice();
    for (let q = 0; q < count - 1; q++) {
      const left = before[q]! >= 0;
      const right = before[q + 1]! >= 0;
      if (left && right) continue;
      if (!pierDown[q]) {
        if (left === right) continue;
        // One neighbour gone: does the pier hold the other span's thrust alone?
        if (model.pierHoldsAlone(q, left ? q + 1 : q)) continue;
        pierDown[q] = true;
      }
      // A pier that fails on its own drops both spans at once; otherwise one step after the span that left it.
      const when = left || right ? Math.max(left ? before[q]! : 0, right ? before[q + 1]! : 0) + COLLAPSE_STEP_DELAY : 0;
      for (const i of [q, q + 1]) {
        if (before[i]! >= 0 || delay[i]! >= 0) continue;
        delay[i] = when;
        // Span q loses the support on its right, span q + 1 the one on its left.
        hinges[i] = supportMechanism(model.ws, model.spans[i]!, model.law, i === q ? 1 : -1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const spans: SpanCollapse[] = [];
  for (let i = 0; i < count; i++) {
    if (delay[i]! < 0) continue;
    const h = hinges[i] ?? [];
    spans.push({ span: i, delay: delay[i]!, hinges: h, sense: senseOf(h) });
  }
  const piers: number[] = [];
  for (let q = 0; q < count - 1; q++) if (pierDown[q]) piers.push(q);
  return { spans, piers };
}
