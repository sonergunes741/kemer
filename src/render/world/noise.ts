/**
 * Seeded 2D gradient noise for the landscape (CPU side). The terrain, the scatter and the water
 * heightmap all sample the same functions, so every layer agrees on where the ground is.
 */
import { mulberry32 } from '../../core/rng';

export type Noise2 = (x: number, y: number) => number;

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/** Perlin-style gradient noise in roughly [-1, 1], deterministic for a seed. */
export function createNoise2(seed: number): Noise2 {
  const rand = mulberry32(seed ^ 0x5bd1e995);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = p[i]!;
    p[i] = p[j]!;
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]!;
  const gx = new Float32Array(256);
  const gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const a = rand() * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const h00 = perm[X + perm[Y]!]!;
    const h10 = perm[X + 1 + perm[Y]!]!;
    const h01 = perm[X + perm[Y + 1]!]!;
    const h11 = perm[X + 1 + perm[Y + 1]!]!;
    const d00 = gx[h00]! * xf + gy[h00]! * yf;
    const d10 = gx[h10]! * (xf - 1) + gy[h10]! * yf;
    const d01 = gx[h01]! * xf + gy[h01]! * (yf - 1);
    const d11 = gx[h11]! * (xf - 1) + gy[h11]! * (yf - 1);
    const u = fade(xf);
    const v = fade(yf);
    const a = d00 + (d10 - d00) * u;
    const b = d01 + (d11 - d01) * u;
    return (a + (b - a) * v) * 1.41;
  };
}

/** Fractal sum; result roughly in [-1, 1]. Each octave is rotated a little to hide the lattice. */
export function fbm(noise: Noise2, x: number, y: number, octaves: number, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let px = x;
  let py = y;
  for (let i = 0; i < octaves; i++) {
    sum += noise(px, py) * amp;
    norm += amp;
    amp *= gain;
    const nx = px * 1.6 - py * 1.2;
    const ny = px * 1.2 + py * 1.6;
    px = nx + 17.3;
    py = ny - 9.1;
  }
  return sum / norm;
}

/** Ridged fractal in [0, 1]: sharp crests, like eroded hills seen from afar. */
export function ridged(noise: Noise2, x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let px = x;
  let py = y;
  for (let i = 0; i < octaves; i++) {
    const r = 1 - Math.abs(noise(px, py));
    sum += r * r * amp;
    norm += amp;
    amp *= 0.5;
    const nx = px * 1.7 - py * 1.1;
    const ny = px * 1.1 + py * 1.7;
    px = nx + 5.7;
    py = ny + 11.9;
  }
  return sum / norm;
}

/** Cheap hash of two integers to [0, 1), for per-cell decisions. */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
