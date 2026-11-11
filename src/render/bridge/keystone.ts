/**
 * The main keystone on the hoist: the trolley runs along the beam after the pointer, the stone
 * swings under it on its rope (a damped pendulum driven by the trolley's acceleration), and when
 * let go close enough above the gap it slides home. Anywhere else it just swings on.
 */
import { Quaternion } from 'three';
import type { Vec2, Vec3 } from '../../core/types';
import { clamp, easeInCubic } from '../../core/math';
import type { Centering } from './centering';
import type { BridgeModel } from './model';

const G = 9.81;
const SLIDE_SECONDS = 0.45;
/** Lowest and highest the stone hangs above its seat while carried, metres. */
const HANG_MIN = 0.25;
const HANG_MAX = 2.2;

const _q = new Quaternion();

export class Keystone {
  readonly seat: Vec3;
  /** Half the stone's height and width, for the rope and the seating tolerance. */
  private readonly halfH: number;
  private readonly tolerance: number;
  private trolley: number;
  private trolleyV = 0;
  private targetX: number;
  private hang: number;
  private targetHang: number;
  private angle = 0;
  private angleV = 0;
  private slide: { t: number; x: number; y: number; angle: number; done: (seated: boolean) => void } | null = null;
  seated = false;

  constructor(
    private readonly model: BridgeModel,
    private readonly centering: Centering,
    readonly index: number,
    readonly span: number,
  ) {
    const s = model.stones[index]!;
    const b = model.field.boxes;
    this.halfH = (b[index * 6 + 4]! - b[index * 6 + 1]!) / 2;
    const width = b[index * 6 + 3]! - b[index * 6]!;
    this.tolerance = Math.max(0.12, width * 0.6);
    this.seat = { x: s.pivot.x, y: s.pivot.y, z: 0 };
    const [x0] = centering.hoistRange;
    // It starts off to one side, so the player has to bring it over the gap.
    this.trolley = clamp(s.pivot.x - 1.2, x0, s.pivot.x);
    this.targetX = this.trolley;
    this.hang = 1.2;
    this.targetHang = 1.2;
    model.laid[index] = 1;
    this.write();
  }

  /** Follow the pointer, in elevation coordinates. */
  move(x: number, y: number): void {
    if (this.slide || this.seated) return;
    const [x0, x1] = this.centering.hoistRange;
    this.targetX = clamp(x, x0, x1);
    this.targetHang = clamp(y - this.seat.y, HANG_MIN, HANG_MAX);
  }

  /** Let go: seats when held close above the gap; resolves whether it did. */
  drop(): Promise<boolean> {
    if (this.seated) return Promise.resolve(true);
    if (this.slide) return Promise.resolve(false);
    const p = this.position();
    const over = Math.abs(p.x - this.seat.x) <= this.tolerance && p.y - this.seat.y < HANG_MAX + 0.3;
    if (!over) {
      // A little kick: it swings back on its rope, nothing else happens.
      this.angleV += 0.6 * Math.sign(this.seat.x - p.x || 1);
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      this.slide = { t: 0, x: p.x, y: p.y, angle: this.angle, done: resolve };
    });
  }

  /**
   * The build went on without it (a game that skips ahead): it stops swinging and no longer
   * drives the hoist, which would otherwise keep showing over a finished bridge.
   */
  abandon(): void {
    this.slide?.done(false);
    this.slide = null;
    this.seated = true;
  }

  /** Where the stone's centre hangs now. */
  position(): Vec2 {
    const len = this.ropeLength();
    return { x: this.trolley + Math.sin(this.angle) * (len + this.halfH), y: this.ropeTop() - Math.cos(this.angle) * (len + this.halfH) };
  }

  private ropeTop(): number {
    return this.centering.beamHeight - 0.4;
  }

  private ropeLength(): number {
    return Math.max(0.1, this.ropeTop() - (this.seat.y + this.hang + this.halfH));
  }

  /** Returns true on the frame the stone seats. */
  update(dt: number): boolean {
    if (this.seated) return false;
    if (this.slide) return this.updateSlide(dt);
    // The trolley chases the pointer like a hand on a rope: critically damped.
    const k = 60;
    const acc = (this.targetX - this.trolley) * k - this.trolleyV * 2 * Math.sqrt(k);
    this.trolleyV += acc * dt;
    this.trolley += this.trolleyV * dt;
    this.hang += (this.targetHang - this.hang) * Math.min(1, dt * 6);
    // Pendulum on the moving trolley: the stone lags behind accelerations.
    const len = this.ropeLength() + this.halfH;
    const alpha = (-G * Math.sin(this.angle) - acc * Math.cos(this.angle)) / len - this.angleV * 1.2;
    this.angleV += alpha * dt;
    this.angle = clamp(this.angle + this.angleV * dt, -0.6, 0.6);
    this.write();
    return false;
  }

  private updateSlide(dt: number): boolean {
    const s = this.slide!;
    s.t += dt;
    const u = Math.min(1, s.t / SLIDE_SECONDS);
    const e = easeInCubic(u);
    const x = s.x + (this.seat.x - s.x) * Math.min(1, u * 2.5);
    const y = s.y + (this.seat.y - s.y) * e;
    this.angle = s.angle * (1 - Math.min(1, u * 2));
    this.angleV = 0;
    this.trolley = x;
    this.hang = Math.max(0, y - this.seat.y);
    this.writeAt(x, y, this.angle);
    if (u < 1) return false;
    this.slide = null;
    this.seated = true;
    this.model.writePose(this.index);
    this.centering.setHoist(true, this.seat.x, { x: this.seat.x, y: this.seat.y + this.halfH });
    s.done(true);
    return true;
  }

  private write(): void {
    const p = this.position();
    this.writeAt(p.x, p.y, this.angle);
  }

  private writeAt(x: number, y: number, angle: number): void {
    _q.set(0, 0, Math.sin(angle / 2), Math.cos(angle / 2));
    this.model.writeAnimated(this.index, x - this.seat.x, y - this.seat.y, 0, _q);
    // The rope is tied to the middle of the stone's top bed, wherever the swing has turned it.
    this.centering.setHoist(true, this.trolley, { x: x - Math.sin(angle) * this.halfH, y: y + Math.cos(angle) * this.halfH });
  }
}
