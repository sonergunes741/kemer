/**
 * Stones swinging into place: a short arc from above and outside the work, a small overshoot as
 * the stone beds, and a settle. Landing is reported once per stone, so the builder can batch the
 * thuds of a flurry into one 'stone:land'.
 */
import { Quaternion, Vector3 } from 'three';
import type { BridgeModel } from './model';

/** Fraction of the flight at which the stone touches its bed. */
const TOUCH = 0.78;
/** How far it beds past its seat before settling back, metres. */
const OVERSHOOT = 0.015;

interface Flight {
  readonly i: number;
  t: number;
  readonly dur: number;
  readonly from: Vector3;
  readonly rot: Quaternion;
  readonly lift: number;
  landed: boolean;
}

const IDENT = new Quaternion();
const _q = new Quaternion();

export class Flights {
  private list: Flight[] = [];

  constructor(private readonly model: BridgeModel) {}

  get busy(): boolean {
    return this.list.length > 0;
  }

  /** Swing stone i in from `from` (offset from its seat) and rotation `rot`, over `dur` seconds. */
  start(i: number, from: Vector3, rot: Quaternion, dur: number, lift = 0.25): void {
    this.model.laid[i] = 1;
    this.list.push({ i, t: 0, dur, from: from.clone(), rot: rot.clone(), lift, landed: false });
    this.pose(this.list[this.list.length - 1]!);
  }

  /** Advance every flight; `land` is called once per stone as it touches its bed. */
  update(dt: number, land: (i: number) => void): void {
    if (this.list.length === 0) return;
    let keep = 0;
    for (const f of this.list) {
      f.t += dt;
      if (!f.landed && f.t >= f.dur * TOUCH) {
        f.landed = true;
        land(f.i);
      }
      if (f.t >= f.dur) {
        this.model.writePose(f.i);
        continue;
      }
      this.pose(f);
      this.list[keep++] = f;
    }
    this.list.length = keep;
  }

  /** Put every stone in flight straight onto its seat (the bridge is being shown, not built). */
  finishAll(land: (i: number) => void): void {
    for (const f of this.list) {
      if (!f.landed) land(f.i);
      this.model.writePose(f.i);
    }
    this.list.length = 0;
  }

  private pose(f: Flight): void {
    const s = Math.min(1, f.t / f.dur);
    if (s < TOUCH) {
      const u = s / TOUCH;
      // Ease out: quick at first, slowing as it comes down onto the bed.
      const e = 1 - (1 - u) * (1 - u);
      const arc = Math.sin(Math.PI * u) * f.lift;
      _q.slerpQuaternions(f.rot, IDENT, e);
      this.model.writeAnimated(f.i, f.from.x * (1 - e), f.from.y * (1 - e) + arc - OVERSHOOT * e * e * e, f.from.z * (1 - e), _q);
    } else {
      // Bedding: a damped bounce out of the overshoot.
      const u = (s - TOUCH) / (1 - TOUCH);
      const y = -OVERSHOOT * (1 - u) * Math.cos(u * Math.PI * 2.5);
      this.model.writeAnimated(f.i, 0, y, 0, IDENT);
    }
  }
}
