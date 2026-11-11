/**
 * Voice allocation and rate limiting for physical sounds. Pure: no Web Audio here, so the rules
 * that keep a collapse (hundreds of impacts in a few seconds) from clipping or choking are tested.
 */

export interface VoiceGrant {
  readonly id: number;
  /** A playing voice to silence to make room, or null. */
  readonly steal: number | null;
}

interface Slot {
  id: number;
  priority: number;
  start: number;
  end: number;
}

/**
 * A fixed number of voices. When full, a new sound may take the place of the least important
 * playing one (lowest priority, then oldest); otherwise it is dropped.
 */
export class VoicePool {
  private slots: Slot[] = [];
  private nextId = 1;
  /** Counters for the harness and tests. */
  granted = 0;
  stolen = 0;
  dropped = 0;
  peak = 0;

  constructor(readonly max: number) {}

  /** Forget voices that have finished by `now`. Returns how many are still sounding. */
  active(now: number): number {
    if (this.slots.some((s) => s.end <= now)) this.slots = this.slots.filter((s) => s.end > now);
    return this.slots.length;
  }

  /** Ask for a voice of `priority` (roughly its loudness) lasting `duration` seconds. */
  acquire(priority: number, now: number, duration: number): VoiceGrant | null {
    const count = this.active(now);
    let steal: number | null = null;
    if (count >= this.max) {
      let victim: Slot | null = null;
      for (const s of this.slots) {
        if (!victim || s.priority < victim.priority || (s.priority === victim.priority && s.start < victim.start)) victim = s;
      }
      if (!victim || victim.priority > priority) {
        this.dropped++;
        return null;
      }
      steal = victim.id;
      this.release(victim.id);
      this.stolen++;
    }
    const id = this.nextId++;
    this.slots.push({ id, priority, start: now, end: now + Math.max(0.01, duration) });
    this.granted++;
    this.peak = Math.max(this.peak, this.slots.length);
    return { id, steal };
  }

  release(id: number): void {
    const i = this.slots.findIndex((s) => s.id === id);
    if (i >= 0) this.slots.splice(i, 1);
  }

  clear(): void {
    this.slots = [];
  }
}

export interface RateRule {
  /** Sustained events per second. */
  readonly rate: number;
  /** How many may arrive at once before the rate applies. */
  readonly burst: number;
}

/** A token bucket per kind of sound. Unknown kinds always pass. */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  passed = 0;
  limited = 0;

  constructor(private readonly rules: Readonly<Record<string, RateRule>>) {}

  allow(kind: string, now: number): boolean {
    const rule = this.rules[kind];
    if (!rule) return true;
    let b = this.buckets.get(kind);
    if (!b) {
      b = { tokens: rule.burst, at: now };
      this.buckets.set(kind, b);
    }
    const elapsed = Math.max(0, now - b.at);
    b.tokens = Math.min(rule.burst, b.tokens + elapsed * rule.rate);
    b.at = Math.max(b.at, now);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      this.passed++;
      return true;
    }
    this.limited++;
    return false;
  }
}

/**
 * Gain for one more voice when `active` are already sounding: unity up to `comfortable`, then
 * falling as 1/sqrt(n) so the summed power of a crowd grows only slowly.
 */
export function crowdGain(active: number, comfortable: number): number {
  if (active <= comfortable) return 1;
  return Math.sqrt(comfortable / active);
}

/** Avoids repeating the same variant twice in a row (the ear notices at once). */
export class VariantPicker {
  private readonly last = new Map<string, number>();

  pick(key: string, count: number, rnd: () => number): number {
    if (count <= 1) return 0;
    const prev = this.last.get(key) ?? -1;
    let i = Math.floor(rnd() * count);
    if (i === prev) i = (i + 1 + Math.floor(rnd() * (count - 1))) % count;
    this.last.set(key, i);
    return i;
  }
}
