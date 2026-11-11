/**
 * How fast stones are laid while the player holds the control (DESIGN 2.3): the first ten are
 * single and distinct, then the pace quickens so that any bridge, from a village arch to ten
 * spans, is laid in about 20 to 30 seconds of holding. Releasing pauses the work and lets the
 * momentum ebb, so a fresh press starts a little slower.
 */

/** Seconds between the first ten stones. */
export const FIRST_GAP = 0.42;
export const FIRST_COUNT = 10;

export interface Pace {
  /** Stones laid so far (fractional: the next one lands when it crosses an integer). */
  laid: number;
  /** Seconds of effective holding after the first ten. */
  momentum: number;
}

/** Total holding time the bridge should take, seconds: 20 for a small arch, 30 for thousands of stones. */
export function targetSeconds(total: number): number {
  const t = Math.log10(Math.max(total, 10) / 60) / Math.log10(4000 / 60);
  return 20 + 10 * Math.min(1, Math.max(0, t));
}

/**
 * Gap between the first ten stones: 0.42 s, longer for a bridge so small that even single stones
 * at that pace would finish too soon (a village arch is laid stone by stone).
 */
export function firstGap(total: number): number {
  return Math.min(1.2, Math.max(FIRST_GAP, (0.9 * targetSeconds(total)) / Math.max(total, 1)));
}

/**
 * Rate after the first ten: r(m) = r0 + a m², with `a` chosen so the remaining stones take the
 * rest of the target time. Quadratic growth feels like gathering speed without a jump.
 */
export function rateAt(momentum: number, total: number): number {
  const gap = firstGap(total);
  const r0 = 1 / gap;
  const rest = Math.max(0, total - FIRST_COUNT);
  const tau = Math.max(1, targetSeconds(total) - FIRST_COUNT * gap);
  const a = Math.max(0, (3 * (rest - r0 * tau)) / (tau * tau * tau));
  return r0 + a * momentum * momentum;
}

/**
 * Advance the pace by dt. Returns how many stones were started in this step: stone k starts as
 * soon as `laid` passes k, so the first one answers the press at once.
 */
export function stepPace(p: Pace, dt: number, holding: boolean, total: number): number {
  const before = Math.ceil(p.laid);
  if (!holding) {
    p.momentum = Math.max(0, p.momentum - dt * 2.5);
    return 0;
  }
  if (p.laid < FIRST_COUNT) {
    p.laid = Math.min(total, p.laid + dt / firstGap(total));
  } else {
    p.momentum += dt;
    p.laid = Math.min(total, p.laid + rateAt(p.momentum, total) * dt);
  }
  return Math.ceil(p.laid) - before;
}
