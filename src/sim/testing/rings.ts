/** Bare circular rings of constant thickness under their own weight: the textbook benchmark cases. */
import { DEG2RAD } from '../../core/math';
import { archShape } from '../arch';
import { SpanModel } from '../span';

/**
 * A ring with centre-line radius 1, thickness `tOverR`, embracing `halfAngleDeg` each side of the
 * crown, cut into about `courses` radial-jointed voussoirs of unit weight. Ready for the solvers.
 */
export function bareRing(halfAngleDeg: number, tOverR: number, courses = 81): SpanModel {
  const ri = 1 - tOverR / 2;
  const a = halfAngleDeg * DEG2RAD;
  const half = ri * Math.sin(a);
  const rise = ri * (1 - Math.cos(a));
  const sp = new SpanModel(archShape(-half, half, 0, rise, 1, tOverR, courses), 1);
  let total = 0;
  for (let k = 0; k < sp.n; k++) {
    sp.selfW0[k] = sp.area[k] as number;
    total += sp.area[k] as number;
  }
  sp.selfW.set(sp.selfW0);
  sp.W = total;
  sp.place();
  sp.refresh();
  return sp;
}
