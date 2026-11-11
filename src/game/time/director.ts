/**
 * The pace of the centuries (DESIGN 2.5): about 8 years a second in the first century and 14 after,
 * times the player's 1x 2x 4x; easing down before every beat and back up after it. The approach is
 * exponential (pace = beat pace + K * distance), so the year glides onto a stop instead of braking;
 * the climb back is a steady multiplication, "faster and faster", like the sun let go.
 */
import type { Beat } from './beats';

/** 1/s: how far ahead the director starts to slow (higher = later, harder). */
const APPROACH = 2.2;
/** 1/s: growth of the pace when climbing back (and of the first launch). */
const CLIMB = 2.2;
const LAUNCH = 3.2;
/** The slowest pace the climb starts from: a few hours of sun a second. */
const CREEP = 3e-4;

export function basePace(year: number, built: number, speed: number): number {
  return (year - built < 100 ? 8 : 14) * speed;
}

export class Director {
  year: number;
  /** Years per second, right now. */
  pace = 0;
  speed: 1 | 2 | 4 = 1;
  /** An outside ceiling on the pace (a lesson, the first warning). */
  cap = Infinity;
  private next = 0;

  constructor(
    private readonly beats: readonly Beat[],
    readonly built: number,
    readonly end: number,
  ) {
    this.year = built;
  }

  /** The next stop beat, which the chronicle must not pass before it is played. */
  get nextStop(): Beat | null {
    for (let i = this.next; i < this.beats.length; i++) if (this.beats[i]!.stop) return this.beats[i]!;
    return null;
  }

  /** The pace the moment allows: the base, the cap, and every beat near enough to matter. */
  target(): number {
    let t = Math.min(basePace(this.year, this.built, this.speed), this.cap);
    for (let i = Math.max(0, this.next - 1); i < this.beats.length; i++) {
      const b = this.beats[i]!;
      const d = Math.abs(b.year - this.year);
      t = Math.min(t, b.pace + APPROACH * d);
      if (b.year > this.year && b.stop) break;
    }
    return t;
  }

  /**
   * Move time on by `dt` real seconds. Returns the stop beat reached (the year then sits on it and
   * the pace is held until release()), or null.
   */
  step(dt: number): Beat | null {
    while (this.next < this.beats.length && !this.beats[this.next]!.stop && this.beats[this.next]!.year <= this.year) this.next++;
    const target = this.target();
    if (target < this.pace) this.pace = target;
    else {
      const grow = this.pace < 0.05 ? LAUNCH : CLIMB;
      this.pace = Math.min(target, Math.max(this.pace, CREEP) * Math.exp(grow * dt));
    }
    const to = this.year + this.pace * dt;
    const stop = this.nextStop;
    if (stop && to >= stop.year) {
      this.year = stop.year;
      this.pace = stop.pace;
      return stop;
    }
    this.year = Math.min(to, this.end);
    return null;
  }

  /** The stop has been played: carry on from it, slowly at first. */
  release(beat: Beat): void {
    const i = this.beats.indexOf(beat);
    if (i >= 0) this.next = Math.max(this.next, i + 1);
    this.pace = Math.min(this.pace, beat.pace);
  }

  /** Start (or restart after a pause) from a creep. */
  launch(): void {
    this.pace = Math.min(this.pace, CREEP);
  }
}
