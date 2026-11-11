/**
 * The mechanism a falling span is handed to the bridge view with (CollapseInfo.spans[].hinges).
 *
 * A ring between two supports needs four hinges to move. The statics do not always name four: a
 * line limited by friction touches the ring at two or three joints, a span that follows a moving
 * support has the three hinges of section 8, and a span whose pier has gone has the three of its
 * minimum-thrust state. This module turns whatever is known into a real four-hinge mechanism:
 *
 * - three hinges known: the fourth is found by rigid-body kinematics, the admissible one on which
 *   the loads do the most work;
 * - fewer, or three that cannot work together: the tight rows of the limiting LP with sliding
 *   switched off (a basis of that LP is four hinges, and by duality they are the mechanism the
 *   loads drive);
 * - and every list is checked to move as a linkage about its joint ends before it goes out,
 *   because that is how the bridge view will turn the stones.
 *
 * On a ring that would stand between fixed supports (its pier went, its support moved) no
 * four-hinge motion is driven by gravity alone: the list is then the one that resists least.
 *
 * Everything here runs once, when a span is condemned, never per frame.
 */
import type { Hinge } from '../core/types';
import type { Workspace } from './ring';
import { hingeOfRow, solveAlpha, solveSpan } from './ring';
import { hingesOf } from './rows';
import type { JointLaw, SpanModel } from './span';

/** A hinge as joint * 2 + side (0: intrados end, 1: extrados end), the numbering of the LP rows. */
type HingeRow = number;

const pts = new Float64Array(8);
const theta = new Float64Array(4);

function rowOf(h: Hinge): HingeRow {
  return h.joint * 2 + (h.side === 'extrados' ? 1 : 0);
}

function hingeAt(sp: SpanModel, row: HingeRow): Hinge {
  const j = row >> 1;
  const intr = (row & 1) === 0;
  return { joint: j, side: intr ? 'intrados' : 'extrados', at: { x: (intr ? sp.ax[j] : sp.bx[j]) as number, y: (intr ? sp.ay[j] : sp.by[j]) as number } };
}

/**
 * Four hinges at four joints (ascending) as a linkage: the three bodies between them turn at
 * rates w1, w2, w3 (anticlockwise positive), the stones outside stand still. Returns the work rate
 * of the loads (dead load plus `lam` times the second load set) per unit of hinge opening, or
 * -Infinity when the motion is impossible: a joint would have to open on the side it hinges on.
 *
 * With H1..H4 the hinge points: w1 (H2 - H1) + w2 (H3 - H2) = w3 (H3 - H4). A hinge at the
 * extrados opens the joint at the intrados, which needs the body on its right to turn
 * anticlockwise against the one on its left; a hinge at the intrados the reverse.
 */
function linkageScore(sp: SpanModel, rows: readonly HingeRow[], lam: number): number {
  for (let k = 0; k < 4; k++) {
    const j = (rows[k] as number) >> 1;
    const extr = ((rows[k] as number) & 1) === 1;
    pts[2 * k] = (extr ? sp.bx[j] : sp.ax[j]) as number;
    pts[2 * k + 1] = (extr ? sp.by[j] : sp.ay[j]) as number;
    if (k > 0 && j <= (rows[k - 1] as number) >> 1) return -Infinity;
  }
  const sign = (k: number): number => (((rows[k] as number) & 1) === 1 ? 1 : -1);
  const w1 = sign(0);
  const ux = (pts[4] as number) - (pts[2] as number);
  const uy = (pts[5] as number) - (pts[3] as number);
  const vx = (pts[4] as number) - (pts[6] as number);
  const vy = (pts[5] as number) - (pts[7] as number);
  const rx = -w1 * ((pts[2] as number) - (pts[0] as number));
  const ry = -w1 * ((pts[3] as number) - (pts[1] as number));
  const den = ux * vy - uy * vx;
  const size = Math.abs(ux) + Math.abs(uy) + Math.abs(vx) + Math.abs(vy);
  // The middle body and the last one in line: a dead point, nothing can move.
  if (Math.abs(den) < 1e-9 * size * size) return -Infinity;
  const w2 = (rx * vy - ry * vx) / den;
  const w3 = (rx * uy - ry * ux) / den;
  theta[0] = w1;
  theta[1] = w2 - w1;
  theta[2] = w3 - w2;
  theta[3] = -w3;
  let opening = 0;
  for (let k = 0; k < 4; k++) {
    const t = sign(k) * (theta[k] as number);
    if (t < -1e-9) return -Infinity;
    opening += (((sp.dh[(rows[k] as number) >> 1] as number) * sp.L) / 2) * Math.abs(theta[k] as number);
  }
  if (!(opening > 0)) return -Infinity;

  // Work rate: a body with velocity v0 at the span's origin O and rate w does f . v0 + w G on a
  // force f whose moment about O is G.
  const { ox, oy, W, L } = sp;
  const j1 = (rows[0] as number) >> 1;
  const j2 = (rows[1] as number) >> 1;
  const j3 = (rows[2] as number) >> 1;
  const j4 = (rows[3] as number) >> 1;
  // Body 2 carries hinge 2 along with body 1 and turns about it.
  const h2vx = -w1 * ((pts[3] as number) - (pts[1] as number));
  const h2vy = w1 * ((pts[2] as number) - (pts[0] as number));
  let work = 0;
  for (let k = j1; k < j4; k++) {
    let w: number;
    let v0x: number;
    let v0y: number;
    if (k < j2) {
      w = w1;
      v0x = w * ((pts[1] as number) - oy);
      v0y = w * (ox - (pts[0] as number));
    } else if (k < j3) {
      w = w2;
      v0x = h2vx + w * ((pts[3] as number) - oy);
      v0y = h2vy + w * (ox - (pts[2] as number));
    } else {
      w = w3;
      v0x = w * ((pts[7] as number) - oy);
      v0y = w * (ox - (pts[6] as number));
    }
    const self = sp.selfW[k] as number;
    const fill = sp.fillW[k] as number;
    let fx = 0;
    let fy = -(self + fill);
    let g = -(((sp.gx[k] as number) - ox) * self + ((sp.fx[k] as number) - ox) * fill);
    if (lam !== 0) {
      fx += lam * W * (sp.lx[k] as number);
      fy += lam * W * (sp.ly[k] as number);
      g += lam * W * L * (sp.lg[k] as number);
    }
    work += fx * v0x + fy * v0y + w * g;
  }
  return work / opening;
}

/**
 * The fourth hinge for three known ones: every free joint and both sides are tried, and the
 * admissible linkage on which the loads do the most work wins (on a ring that would stand, the
 * one that resists least). Hinges that alternate between intrados and extrados are preferred, and
 * with `towards` (-1 left, +1 right) so is a fourth hinge beyond the known ones on the side of a
 * support that has given way. Null when nothing admissible exists.
 */
function fourthHinge(sp: SpanModel, seed: readonly HingeRow[], lam: number, towards: number): HingeRow[] | null {
  const known = seed.slice().sort((a, b) => a - b);
  const first = known[0]! >> 1;
  const middle = known[1]! >> 1;
  const last = known[2]! >> 1;
  if (first === middle || middle === last) return null;
  const trial: HingeRow[] = [0, 0, 0, 0];
  let best: HingeRow[] | null = null;
  let bestScore = -Infinity;
  // Pass 0: alternating and on the side that moves; pass 1: alternating; pass 2: anything that can move.
  for (let pass = towards === 0 ? 1 : 0; pass < 3 && !best; pass++) {
    for (let j = 0; j <= sp.n; j++) {
      if (j === first || j === middle || j === last) continue;
      if (pass === 0 && (towards > 0 ? j < last : j > first)) continue;
      for (let side = 0; side < 2; side++) {
        const row = 2 * j + side;
        let at = 0;
        while (at < 3 && (known[at] as number) < row) at++;
        for (let k = 0; k < 4; k++) trial[k] = k < at ? (known[k] as number) : k === at ? row : (known[k - 1] as number);
        if (pass < 2 && !(((trial[0] as number) ^ (trial[1] as number)) & ((trial[1] as number) ^ (trial[2] as number)) & ((trial[2] as number) ^ (trial[3] as number)) & 1)) continue;
        const score = linkageScore(sp, trial, lam);
        if (score > bestScore) {
          bestScore = score;
          best = trial.slice();
        }
      }
    }
  }
  return best;
}

/** True when every four hinges in a row of the list (ascending joints) can move together. */
function moves(sp: SpanModel, rows: readonly HingeRow[], lam: number): boolean {
  if (rows.length < 4) return false;
  for (let k = 0; k + 4 <= rows.length; k++) if (linkageScore(sp, rows.slice(k, k + 4), lam) === -Infinity) return false;
  return true;
}

/** Add hinges to the pool of candidates, one per joint, first come first kept. */
function pour(pool: HingeRow[], rows: readonly HingeRow[]): void {
  for (const r of rows) if (r >= 0 && !pool.some((x) => x >> 1 === r >> 1)) pool.push(r);
}

/** The hinge rows in the basis of the last LP (`shift`: rows written before the no-tension rows). */
function basisRows(ws: Workspace, sp: SpanModel, slots: number, shift: number): HingeRow[] {
  const rows: HingeRow[] = [];
  for (let i = 0; i < slots; i++) {
    const row = (ws.lp.basis[i] as number) - shift;
    const r = row >= 0 ? hingeOfRow(ws, sp, row) : -1;
    if (r >= 0) rows.push(r);
  }
  return rows.sort((a, b) => a - b);
}

/**
 * What the limiting LPs say, with sliding switched off (a mechanism of hinges cannot show a
 * slide): under the transient load at its limit when there is one, then under dead load, where
 * the joints holding the most central line are how the ring falls below gsf 1 and how it would
 * fall if it were thinner above. Returns a list that moves, or null after adding every hinge it
 * saw to `pool`. Hinges limited by crushing pivot a little inside the stone, so a basis is not
 * always a linkage about the joint ends: hence the check.
 */
function limitRows(ws: Workspace, sp: SpanModel, law: JointLaw, lam: number, alpha: number, pool: HingeRow[]): HingeRow[] | null {
  const rigid: JointLaw = { mu: Infinity, sigma: law.sigma };
  if (lam !== 0 && solveSpan(ws, sp, rigid, alpha, 0, 0, 1, true) === 'optimal') {
    const basis = basisRows(ws, sp, 4, 0);
    if (moves(sp, basis, lam)) return basis;
    pour(pool, basis);
  }
  const least = solveAlpha(ws, sp, rigid);
  if (least === Infinity) return null;
  // Every joint the line touches, when that is a mechanism already (a symmetric ring has five).
  const touching = hingesOf(sp, sp.sol[0] as number, sp.sol[1] as number, sp.sol[2] as number, 0, least, rigid).map(rowOf);
  if (moves(sp, touching, 0)) return touching;
  // Rows of solveAlpha's problem: the thrust cap first, then the no-tension rows and the lazy tier.
  const basis = basisRows(ws, sp, 4, 1);
  if (moves(sp, basis, 0)) return basis;
  pour(pool, touching);
  pour(pool, basis);
  return null;
}

/** Three hinges out of the pool (the earliest entries first) that a fourth can be found for. */
function fromPool(sp: SpanModel, pool: readonly HingeRow[], lam: number, towards: number): HingeRow[] | null {
  // Eight candidates are 56 triples at most: bounded work even when nothing can move.
  for (let c = 2; c < pool.length && c < 8; c++) {
    for (let b = 1; b < c; b++) {
      for (let a = 0; a < b; a++) {
        const rows = fourthHinge(sp, [pool[a] as number, pool[b] as number, pool[c] as number], lam, towards);
        if (rows) return rows;
      }
    }
  }
  return null;
}

/** The textbook mechanism: springings and crown hinge at the extrados, haunches at the intrados. */
function textbook(sp: SpanModel): HingeRow[] {
  const n = sp.n;
  const q = Math.max(1, Math.round(n / 4));
  return [1, 2 * q, 2 * ((n + 1) >> 1) + 1, 2 * (n - q), 2 * n + 1];
}

/**
 * True when the hinges (four or more, left to right) can move as linkages about their joint ends
 * without any joint having to close through the stone. The span model must be in the state the
 * hinges were found in.
 */
export function mechanismMoves(sp: SpanModel, hinges: readonly Hinge[]): boolean {
  return moves(sp, hinges.map(rowOf), 0);
}

/**
 * At least four hinges for a span that is coming down, from the hinges the statics named (`seed`,
 * any number). The span model must be in the state it falls from: weathered, moved, loaded.
 * `lam` and `alpha` describe a transient load at work (the second load set must still be applied);
 * `towards` is the side of a support that has given way (-1 left, +1 right, 0 neither).
 * Clobbers the workspace and sp.sol.
 *
 * In order: the seed itself when it already moves; the seed's three hinges with a fourth; the
 * limiting LPs; any three hinges seen on the way with a fourth, the seed's first (two cracks at
 * both springings and one at the crown cannot all work between fixed supports); the textbook
 * mechanism.
 */
export function completeMechanism(ws: Workspace, sp: SpanModel, law: JointLaw, seed: readonly Hinge[], lam = 0, alpha = 1, towards = 0): Hinge[] {
  const given = seed.map(rowOf);
  if (moves(sp, given, lam)) return seed.slice();
  const pool: HingeRow[] = [];
  pour(pool, given);
  let rows = pool.length === 3 ? fourthHinge(sp, pool, lam, towards) : null;
  rows ??= limitRows(ws, sp, law, lam, alpha, pool);
  rows ??= fromPool(sp, pool, lam, towards);
  rows ??= textbook(sp);
  return rows.map((row) => hingeAt(sp, row));
}

/**
 * Hinges of a span whose support has given way (`towards`: -1 the left one, +1 the right one):
 * the three of its minimum-thrust state, where it opens as the support leaves, and a fourth on
 * the side that moves.
 */
export function supportMechanism(ws: Workspace, sp: SpanModel, law: JointLaw, towards: number): Hinge[] {
  let seed: Hinge[] = [];
  if (solveSpan(ws, sp, { mu: Infinity, sigma: law.sigma }, 1, -1, 0, 0, false) === 'optimal') seed = basisRows(ws, sp, 3, 0).map((row) => hingeAt(sp, row));
  return completeMechanism(ws, sp, law, seed, 0, 1, towards);
}
