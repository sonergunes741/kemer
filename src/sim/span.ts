/**
 * Joint statics of one span (SIM-SPEC section 3).
 *
 * Unknowns are the force (Rx, Ry) the left support puts on the first course and its moment m0
 * about the span's own origin, scaled to X = Rx / W, Y = Ry / W, m = m0 / (W L). At every joint
 * the normal force, shear and moment are affine in (X, Y, m) and in a load multiplier lambda:
 *
 *   N = nx X + ny Y + n0 + lambda nl      (compression positive)
 *   V = ex X + ey Y + v0 + lambda vl
 *   M = mx X + my Y + m + m0 + lambda ml  (about the joint centre; thrust at eps = -M / N)
 *
 * SpanModel keeps those coefficients in typed arrays for the current state of the ring (weathered
 * joints, stones moved by a support movement, buoyant weights); rows.ts turns them into LP rows.
 */
import type { Vec2 } from '../core/types';
import type { ArchShape } from './arch';
import { archBlocks, archJoints } from './arch';
import { JOINT_MIN_DEPTH } from './tuning';

/** Joint properties of the masonry. Infinity switches a limit off (the textbook rigid-block arch). */
export interface JointLaw {
  /** Friction coefficient. */
  readonly mu: number;
  /** Crushing strength, kPa. */
  readonly sigma: number;
}

export const RIGID: JointLaw = { mu: Infinity, sigma: Infinity };

/** Samples per course of the fill column above it (Simpson, four intervals). */
export const FILL_SAMPLES = 5;

/** Number of per-joint and per-course Float64Arrays a SpanModel holds (see the constructor). */
const JOINT_ARRAYS = 21;
const BLOCK_ARRAYS = 17;

export class SpanModel {
  readonly shape: ArchShape;
  readonly n: number;
  /** Origin of moments, length scale and force scale. */
  readonly ox: number;
  readonly oy: number;
  readonly L: number;
  W = 1;

  /* As built. */
  readonly ax0: Float64Array;
  readonly ay0: Float64Array;
  readonly bx0: Float64Array;
  readonly by0: Float64Array;
  readonly area: Float64Array;
  readonly gx0: Float64Array;
  readonly gy0: Float64Array;
  readonly fx0: Float64Array;
  readonly fy0: Float64Array;
  /** Dry weights per course: ring stone, and fill with deck load, kN per metre of width. */
  readonly selfW0: Float64Array;
  readonly fillW0: Float64Array;
  /** Fill column samples per course: bottom (ring back) and top (deck) elevations, and strip width. */
  readonly fillBot: Float64Array;
  readonly fillTop: Float64Array;
  readonly fillDx: Float64Array;

  /* Current state. */
  readonly selfW: Float64Array;
  readonly fillW: Float64Array;
  readonly ax: Float64Array;
  readonly ay: Float64Array;
  readonly bx: Float64Array;
  readonly by: Float64Array;
  readonly gx: Float64Array;
  readonly gy: Float64Array;
  readonly fx: Float64Array;
  readonly fy: Float64Array;
  /** Joint depth lost to weathering (from the intrados side), metres. */
  loss = 0;
  /** Rigid bodies of a support movement: (cos, sin, tx, ty) each; body 0 is the identity. */
  readonly bodies = new Float64Array(16);
  readonly blockBody: Uint8Array;
  readonly jointBody: Uint8Array;
  moved = false;

  /* Joint forms (scaled), see the file comment. */
  readonly nx: Float64Array;
  readonly ny: Float64Array;
  readonly n0: Float64Array;
  readonly nl: Float64Array;
  readonly ex: Float64Array;
  readonly ey: Float64Array;
  readonly v0: Float64Array;
  readonly vl: Float64Array;
  readonly mx: Float64Array;
  readonly my: Float64Array;
  readonly m0: Float64Array;
  readonly ml: Float64Array;
  /** Joint depth over L. */
  readonly dh: Float64Array;

  /** Second load set per course (live load or earthquake): force and moment about the origin, scaled. */
  readonly lx: Float64Array;
  readonly ly: Float64Array;
  readonly lg: Float64Array;

  /** Totals at the right springing (scaled): dead load Fy and moment, second load set Fx, Fy, moment. */
  endFy = 0;
  endG = 0;
  endLx = 0;
  endLy = 0;
  endLg = 0;
  /** Rows (0..2n+1, see writeNoTension) tight at the minimum-thrust state, or -1: a ready basis for coupled problems. */
  readonly thrustBasis = new Int32Array([-1, -1, -1]);

  /** The minimum-thrust state at alpha = 1 (X, Y, m), valid when thrustOk. */
  readonly thrustState = new Float64Array(3);
  thrustOk = false;

  /** Solution of the last question asked: X, Y, m, lambda. */
  readonly sol = new Float64Array(4);

  constructor(shape: ArchShape, lengthScale: number) {
    const n = shape.n;
    this.shape = shape;
    this.n = n;
    this.ox = shape.xc;
    this.oy = shape.ys;
    this.L = lengthScale;
    // One backing store for all per-joint and per-course arrays: a model is built on every
    // pointer move, and dozens of small typed arrays each cost an allocation.
    const store = new Float64Array(JOINT_ARRAYS * (n + 1) + (BLOCK_ARRAYS + 2 * FILL_SAMPLES) * n);
    let used = 0;
    const take = (length: number): Float64Array => {
      const view = store.subarray(used, used + length);
      used += length;
      return view;
    };
    const joint = (): Float64Array => take(n + 1);
    const block = (): Float64Array => take(n);
    this.ax0 = joint();
    this.ay0 = joint();
    this.bx0 = joint();
    this.by0 = joint();
    this.area = block();
    this.gx0 = block();
    this.gy0 = block();
    this.fx0 = block();
    this.fy0 = block();
    this.selfW0 = block();
    this.fillW0 = block();
    this.fillBot = take(n * FILL_SAMPLES);
    this.fillTop = take(n * FILL_SAMPLES);
    this.fillDx = block();
    this.selfW = block();
    this.fillW = block();
    this.ax = joint();
    this.ay = joint();
    this.bx = joint();
    this.by = joint();
    this.gx = block();
    this.gy = block();
    this.fx = block();
    this.fy = block();
    this.blockBody = new Uint8Array(n);
    this.jointBody = new Uint8Array(n + 1);
    this.nx = joint();
    this.ny = joint();
    this.n0 = joint();
    this.nl = joint();
    this.ex = joint();
    this.ey = joint();
    this.v0 = joint();
    this.vl = joint();
    this.mx = joint();
    this.my = joint();
    this.m0 = joint();
    this.ml = joint();
    this.dh = joint();
    this.lx = block();
    this.ly = block();
    this.lg = block();
    archJoints(shape, this.ax0, this.ay0, this.bx0, this.by0);
    archBlocks(shape, this.area, this.gx0, this.gy0);
    this.fx0.set(this.gx0);
    this.fy0.set(this.gy0);
    this.bodies[0] = 1;
  }

  /** Dry dead load of the span, kN per metre of width. */
  dryWeight(): number {
    let sum = 0;
    for (let k = 0; k < this.n; k++) sum += (this.selfW0[k] as number) + (this.fillW0[k] as number);
    return sum;
  }

  /** Intrados end of joint j as built but with the weathered depth taken off. */
  weatheredA(j: number, out: Vec2): Vec2 {
    const dx = (this.bx0[j] as number) - (this.ax0[j] as number);
    const dy = (this.by0[j] as number) - (this.ay0[j] as number);
    const d = Math.sqrt(dx * dx + dy * dy);
    const cut = Math.min(this.loss, (1 - JOINT_MIN_DEPTH) * d) / d;
    out.x = (this.ax0[j] as number) + dx * cut;
    out.y = (this.ay0[j] as number) + dy * cut;
    return out;
  }

  /** Forget any support movement. */
  resetBodies(): void {
    this.bodies.fill(0);
    this.bodies[0] = 1;
    this.blockBody.fill(0);
    this.jointBody.fill(0);
    this.moved = false;
  }

  /** Current joint ends and load points from the as-built shape, the joint loss and the bodies. */
  place(): void {
    const n = this.n;
    const b = this.bodies;
    const tmp = scratch;
    for (let j = 0; j <= n; j++) {
      this.weatheredA(j, tmp);
      const q = (this.jointBody[j] as number) * 4;
      const c = this.moved ? (b[q] as number) : 1;
      const s = this.moved ? (b[q + 1] as number) : 0;
      const tx = this.moved ? (b[q + 2] as number) : 0;
      const ty = this.moved ? (b[q + 3] as number) : 0;
      const x0 = this.bx0[j] as number;
      const y0 = this.by0[j] as number;
      this.ax[j] = c * tmp.x - s * tmp.y + tx;
      this.ay[j] = s * tmp.x + c * tmp.y + ty;
      this.bx[j] = c * x0 - s * y0 + tx;
      this.by[j] = s * x0 + c * y0 + ty;
    }
    for (let k = 0; k < n; k++) {
      const q = (this.blockBody[k] as number) * 4;
      const c = this.moved ? (b[q] as number) : 1;
      const s = this.moved ? (b[q + 1] as number) : 0;
      const tx = this.moved ? (b[q + 2] as number) : 0;
      const ty = this.moved ? (b[q + 3] as number) : 0;
      let x0 = this.gx0[k] as number;
      let y0 = this.gy0[k] as number;
      this.gx[k] = c * x0 - s * y0 + tx;
      this.gy[k] = s * x0 + c * y0 + ty;
      x0 = this.fx0[k] as number;
      y0 = this.fy0[k] as number;
      this.fx[k] = c * x0 - s * y0 + tx;
      this.fy[k] = s * x0 + c * y0 + ty;
    }
  }

  /** Recompute the joint forms for the current positions and weights (dead load only). */
  refresh(): void {
    const n = this.n;
    const W = this.W;
    const L = this.L;
    let fy = 0;
    let g = 0;
    for (let j = 0; j <= n; j++) {
      const dx = (this.bx[j] as number) - (this.ax[j] as number);
      const dy = (this.by[j] as number) - (this.ay[j] as number);
      const d = Math.sqrt(dx * dx + dy * dy);
      const ex = dx / d;
      const ey = dy / d;
      const cx = (((this.ax[j] as number) + (this.bx[j] as number)) / 2 - this.ox) / L;
      const cy = (((this.ay[j] as number) + (this.by[j] as number)) / 2 - this.oy) / L;
      this.ex[j] = ex;
      this.ey[j] = ey;
      this.nx[j] = ey;
      this.ny[j] = -ex;
      this.dh[j] = d / L;
      this.mx[j] = cy;
      this.my[j] = -cx;
      // Dead load is vertical: F = (0, fy), moment g.
      this.n0[j] = -ex * fy;
      this.v0[j] = ey * fy;
      this.m0[j] = g - cx * fy;
      this.nl[j] = 0;
      this.vl[j] = 0;
      this.ml[j] = 0;
      if (j < n) {
        const ws = (this.selfW[j] as number) / W;
        const wf = (this.fillW[j] as number) / W;
        fy -= ws + wf;
        g -= (((this.gx[j] as number) - this.ox) * ws + ((this.fx[j] as number) - this.ox) * wf) / L;
      }
    }
    this.endFy = fy;
    this.endG = g;
    this.endLx = 0;
    this.endLy = 0;
    this.endLg = 0;
  }

  /** Fold the second load set (lx, ly, lg per course) into the lambda columns of the joint forms. */
  applySecond(): void {
    const n = this.n;
    let fx = 0;
    let fy = 0;
    let g = 0;
    for (let j = 0; j <= n; j++) {
      const cx = -(this.my[j] as number);
      const cy = this.mx[j] as number;
      this.nl[j] = (this.nx[j] as number) * fx + (this.ny[j] as number) * fy;
      this.vl[j] = (this.ex[j] as number) * fx + (this.ey[j] as number) * fy;
      this.ml[j] = g - cx * fy + cy * fx;
      if (j < n) {
        fx += this.lx[j] as number;
        fy += this.ly[j] as number;
        g += this.lg[j] as number;
      }
    }
    this.endLx = fx;
    this.endLy = fy;
    this.endLg = g;
  }

  /** Remove the second load set. */
  clearSecond(): void {
    this.nl.fill(0);
    this.vl.fill(0);
    this.ml.fill(0);
    this.endLx = 0;
    this.endLy = 0;
    this.endLg = 0;
  }

  /** Horizontal inertia of every weight, in direction `dir` (+1 or -1), as the second load set: lambda is in g. */
  setQuake(dir: number): void {
    for (let k = 0; k < this.n; k++) {
      const ws = (this.selfW[k] as number) / this.W;
      const wf = (this.fillW[k] as number) / this.W;
      this.lx[k] = dir * (ws + wf);
      this.ly[k] = 0;
      // Moment of a horizontal force about the origin: -y * fx.
      this.lg[k] = (-dir * (((this.gy[k] as number) - this.oy) * ws + ((this.fy[k] as number) - this.oy) * wf)) / this.L;
    }
    this.applySecond();
  }

  /** N, V, M (scaled) at joint j for a state; results in `out` [N, V, M]. */
  forces(j: number, X: number, Y: number, m: number, lam: number, out: Float64Array): void {
    out[0] = (this.nx[j] as number) * X + (this.ny[j] as number) * Y + (this.n0[j] as number) + lam * (this.nl[j] as number);
    out[1] = (this.ex[j] as number) * X + (this.ey[j] as number) * Y + (this.v0[j] as number) + lam * (this.vl[j] as number);
    out[2] = (this.mx[j] as number) * X + (this.my[j] as number) * Y + m + (this.m0[j] as number) + lam * (this.ml[j] as number);
  }
}

const scratch: Vec2 = { x: 0, y: 0 };
