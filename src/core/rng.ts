/** Deterministic randomness. The simulation and every seeded feature (daily piece) must use this. */

/** FNV-1a 32-bit hash of a string, as an unsigned integer. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: tiny, fast, good-enough PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly source: () => number;
  private spareGauss: number | null = null;

  constructor(seed: number) {
    this.source = mulberry32(seed);
  }

  /** Float in [0, 1). */
  next(): number {
    return this.source();
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.source();
  }

  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.source() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.source() < p;
  }

  /** Uniformly chosen element. Throws on an empty array (programming error). */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[Math.floor(this.source() * items.length)] as T;
  }

  /** Standard normal sample (Box-Muller, cached pair). */
  gauss(): number {
    if (this.spareGauss !== null) {
      const s = this.spareGauss;
      this.spareGauss = null;
      return s;
    }
    let u = 0;
    while (u <= Number.EPSILON) u = this.source();
    const v = this.source();
    const mag = Math.sqrt(-2 * Math.log(u));
    this.spareGauss = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  }

  /** Independent child stream, stable for a given label. */
  fork(label: string): Rng {
    return new Rng((hashString(label) ^ Math.floor(this.source() * 4294967296)) >>> 0);
  }
}
