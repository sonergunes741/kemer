/**
 * Arches on moving supports (SIM-SPEC section 8).
 *
 * The right support moves `u` apart and `v` down relative to the left one. The ring follows as
 * four rigid bodies joined at three hinges: exact kinematics from the as-built shape. Which three
 * joints hinge is found by iteration: deform, ask the deformed ring for the state that does the
 * least work on the moving support, read its hinges, and deform again if they differ.
 */
import type { Hinge, StoneShift, Vec2 } from '../core/types';
import type { Workspace } from './ring';
import { hingeOfRow, solveAlpha, solveSpan } from './ring';
import type { JointLaw, SpanModel } from './span';
import { MOVE_EPS, MOVE_ROUNDS, SPREAD_MAX_RATIO, SPREAD_STEPS } from './tuning';

/** Three hinges, left to right: joint index and side (0 = intrados end, 1 = extrados end). */
export type HingeSet = [number, number, number, number, number, number];

export interface MoveResult {
  /** False when the span cannot follow the movement: snap-through or no admissible state. */
  ok: boolean;
  /** alpha_min on the deformed shape (Infinity when not ok or not asked for). */
  alpha: number;
  hinges: HingeSet | null;
}

const h1: Vec2 = { x: 0, y: 0 };
const h2: Vec2 = { x: 0, y: 0 };
const h3: Vec2 = { x: 0, y: 0 };

function hingePoint(sp: SpanModel, joint: number, side: number, out: Vec2): Vec2 {
  if (side === 0) return sp.weatheredA(joint, out);
  out.x = sp.bx0[joint] as number;
  out.y = sp.by0[joint] as number;
  return out;
}

/**
 * Move the stones for a hinge set and a support movement. Returns false when the two hinged
 * bodies can no longer reach each other (snap-through or pulled straight).
 */
export function deform(sp: SpanModel, set: HingeSet, u: number, v: number): boolean {
  const [j1, s1, j2, s2, j3, s3] = set;
  hingePoint(sp, j1, s1, h1);
  hingePoint(sp, j2, s2, h2);
  hingePoint(sp, j3, s3, h3);
  const tx = h3.x + u;
  const ty = h3.y - v;
  // Middle hinge: intersection of two circles about the outer hinges.
  const ax = h2.x - h1.x;
  const ay = h2.y - h1.y;
  const bx = h2.x - h3.x;
  const by = h2.y - h3.y;
  const l1sq = ax * ax + ay * ay;
  const l2sq = bx * bx + by * by;
  const dx = tx - h1.x;
  const dy = ty - h1.y;
  const dsq = dx * dx + dy * dy;
  if (dsq < 1e-12 || l1sq < 1e-12 || l2sq < 1e-12) return false;
  const d = Math.sqrt(dsq);
  const along = (l1sq - l2sq + dsq) / (2 * d);
  const hsq = l1sq - along * along;
  if (hsq < 0) return false;
  const h = Math.sqrt(hsq);
  // The side of the chord the middle hinge sat on as built: stay on it (continuity).
  const side = (h3.x - h1.x) * ay - (h3.y - h1.y) * ax >= 0 ? 1 : -1;
  const mx = h1.x + (along * dx) / d - (side * h * dy) / d;
  const my = h1.y + (along * dy) / d + (side * h * dx) / d;

  const b = sp.bodies;
  b[0] = 1;
  b[1] = 0;
  b[2] = 0;
  b[3] = 0;
  // Body 1 turns about the first hinge.
  let nx = mx - h1.x;
  let ny = my - h1.y;
  let c = (ax * nx + ay * ny) / l1sq;
  let s = (ax * ny - ay * nx) / l1sq;
  b[4] = c;
  b[5] = s;
  b[6] = h1.x - (c * h1.x - s * h1.y);
  b[7] = h1.y - (s * h1.x + c * h1.y);
  // Body 2 turns about the third hinge, which has moved with the support.
  nx = mx - tx;
  ny = my - ty;
  c = (bx * nx + by * ny) / l2sq;
  s = (bx * ny - by * nx) / l2sq;
  b[8] = c;
  b[9] = s;
  b[10] = tx - (c * h3.x - s * h3.y);
  b[11] = ty - (s * h3.x + c * h3.y);
  // Body 3 rides on the support.
  b[12] = 1;
  b[13] = 0;
  b[14] = u;
  b[15] = -v;
  for (let k = 0; k < sp.n; k++) sp.blockBody[k] = k < j1 ? 0 : k < j2 ? 1 : k < j3 ? 2 : 3;
  // A hinge joint keeps the face of the body on its left.
  for (let j = 0; j <= sp.n; j++) sp.jointBody[j] = j <= j1 ? 0 : j <= j2 ? 1 : j <= j3 ? 2 : 3;
  sp.moved = true;
  sp.place();
  sp.refresh();
  return true;
}

/** The three hinges in the LP basis as a hinge set, or null if the basis is not three hinges. */
function basisHinges(ws: Workspace, sp: SpanModel): HingeSet | null {
  const b = ws.lp.basis;
  const r = [hingeOfRow(ws, sp, b[0] as number), hingeOfRow(ws, sp, b[1] as number), hingeOfRow(ws, sp, b[2] as number)].sort((p, q) => p - q);
  if (r[0]! < 0) return null;
  const j1 = r[0]! >> 1;
  const j2 = r[1]! >> 1;
  const j3 = r[2]! >> 1;
  if (j1 === j2 || j2 === j3) return null;
  return [j1, r[0]! % 2, j2, r[1]! % 2, j3, r[2]! % 2];
}

function sameSet(a: HingeSet, b: HingeSet): boolean {
  for (let i = 0; i < 6; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Put the span in the shape its supports force on it. (du, dv) is the direction of the latest
 * movement (defaults to the total). With `withGsf` the result carries alpha_min on that shape.
 * The model is left deformed (or as built when the movement is negligible).
 *
 * `open` is the hinge set the span already has open from an earlier look, if any. A cracked ring
 * keeps its cracks: the iteration starts from that set on the deformed shape, and only when that
 * shape can no longer be reached does it start again from the as-built minimum-thrust hinges.
 * Restarting from the as-built shape every time let the set jump between two looks a year apart,
 * and a ring standing at 1.3 snapped through the next year with nothing in between. For the same
 * reason, when the iteration would move the ring onto hinges it cannot stand on, while it can
 * still stand on the ones it has open, it keeps those: a thrust line inside the shape it has is
 * enough (the safe theorem), and the margin then falls year by year instead of all at once.
 */
export function solveMovement(ws: Workspace, sp: SpanModel, law: JointLaw, u: number, v: number, withGsf: boolean, du = u, dv = v, open: HingeSet | null = null): MoveResult {
  if (open) {
    const kept = iterate(ws, sp, law, u, v, withGsf, du, dv, open);
    if (kept.ok) return kept;
    if (deform(sp, open, u, v)) {
      const alpha = withGsf ? solveAlpha(ws, sp, law) : Infinity;
      if (!withGsf || alpha <= 1 + 1e-6) return { ok: true, alpha, hinges: open };
    }
  }
  return iterate(ws, sp, law, u, v, withGsf, du, dv, null);
}

function iterate(ws: Workspace, sp: SpanModel, law: JointLaw, u: number, v: number, withGsf: boolean, du: number, dv: number, open: HingeSet | null): MoveResult {
  sp.resetBodies();
  sp.place();
  sp.refresh();
  const size = Math.sqrt(du * du + dv * dv);
  if (Math.abs(u) < MOVE_EPS && Math.abs(v) < MOVE_EPS) {
    return { ok: true, alpha: withGsf ? solveAlpha(ws, sp, law) : Infinity, hinges: null };
  }
  // Least work on the moving support: minimise Q_N . (du, -dv); Q_N differs from (X, Y) by a constant.
  const cx = size > 0 ? -du / size : -1;
  const cy = size > 0 ? dv / size : 0;
  let set = open;
  if (!set) {
    if (solveSpan(ws, sp, law, 1, cx, cy, 0, false) !== 'optimal') return { ok: false, alpha: Infinity, hinges: null };
    set = basisHinges(ws, sp);
    if (!set) return { ok: true, alpha: withGsf ? solveAlpha(ws, sp, law) : Infinity, hinges: null };
  }
  for (let round = 0; round < MOVE_ROUNDS; round++) {
    if (!deform(sp, set, u, v)) return { ok: false, alpha: Infinity, hinges: set };
    if (solveSpan(ws, sp, law, 1, cx, cy, 0, false) !== 'optimal') return { ok: false, alpha: Infinity, hinges: set };
    const next = basisHinges(ws, sp);
    if (!next || sameSet(next, set)) break;
    set = next;
    if (round === MOVE_ROUNDS - 1 && !deform(sp, set, u, v)) return { ok: false, alpha: Infinity, hinges: set };
  }
  const alpha = withGsf ? solveAlpha(ws, sp, law) : Infinity;
  return { ok: !withGsf || alpha <= 1 + 1e-6, alpha, hinges: set };
}

/** Outward movement of the right support (v = 0) at which the span collapses, metres. */
export function spreadCapacity(ws: Workspace, sp: SpanModel, law: JointLaw): number {
  let lo = 0;
  let hi = SPREAD_MAX_RATIO * sp.shape.span;
  if (!solveMovement(ws, sp, law, 0, 0, true).ok) return 0;
  if (solveMovement(ws, sp, law, hi, 0, false).ok) lo = hi;
  else {
    for (let i = 0; i < SPREAD_STEPS; i++) {
      const mid = (lo + hi) / 2;
      if (solveMovement(ws, sp, law, mid, 0, false).ok) lo = mid;
      else hi = mid;
    }
  }
  sp.resetBodies();
  sp.place();
  sp.refresh();
  return lo;
}

/** Hinges of a hinge set as public objects, at their current (moved) positions. */
export function hingeList(sp: SpanModel, set: HingeSet | null): Hinge[] {
  const out: Hinge[] = [];
  if (!set) return out;
  for (let i = 0; i < 3; i++) {
    const j = set[2 * i] as number;
    const intr = set[2 * i + 1] === 0;
    out.push({ joint: j, side: intr ? 'intrados' : 'extrados', at: { x: (intr ? sp.ax[j] : sp.bx[j]) as number, y: (intr ? sp.ay[j] : sp.by[j]) as number } });
  }
  return out;
}

/** Movement of every voussoir from its as-built place: translation of the centroid and rotation. */
export function shiftsOf(sp: SpanModel, out: StoneShift[]): void {
  for (let k = 0; k < sp.n; k++) {
    const q = (sp.blockBody[k] as number) * 4;
    const shift = out[k] ?? (out[k] = { dx: 0, dy: 0, rot: 0 });
    shift.dx = sp.moved ? (sp.gx[k] as number) - (sp.gx0[k] as number) : 0;
    shift.dy = sp.moved ? (sp.gy[k] as number) - (sp.gy0[k] as number) : 0;
    shift.rot = sp.moved ? Math.atan2(sp.bodies[q + 1] as number, sp.bodies[q] as number) : 0;
  }
  out.length = sp.n;
}
