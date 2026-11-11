/**
 * Measurements for rendered sounds, so levels can be checked by numbers instead of ears:
 * sample peak, loudness (ITU-R BS.1770 K-weighting: momentary maximum and gated integrated),
 * spectral centroid and audible duration. Pure; used by the harness and the tests.
 */

export interface Metrics {
  /** Sample peak, dBFS. */
  readonly peakDb: number;
  /** Highest momentary loudness (400 ms windows), LUFS. */
  readonly lufsM: number;
  /** Gated integrated loudness, LUFS. */
  readonly lufsI: number;
  /** Magnitude-weighted mean frequency of the louder frames, Hz. */
  readonly centroidHz: number;
  /** Seconds from the first to the last moment within 30 dB of the loudest 10 ms (its audible length in a mix). */
  readonly duration: number;
}

const SILENT = -120;

function db(x: number): number {
  return x > 0 ? Math.max(SILENT, 20 * Math.log10(x)) : SILENT;
}

/**
 * The two BS.1770 pre-filters (high shelf, then the RLB high-pass) for any sample rate.
 * Uses the bilinear parameterisation libebur128 fitted to the standard's 48 kHz coefficients;
 * the textbook (RBJ) shelf with the same numbers reads about 0.25 dB low at 1 kHz.
 */
export function kWeight(data: Float32Array, sr: number): Float32Array {
  const out = new Float32Array(data.length);
  const stages: [number, number, number, number, number][] = [];
  {
    const Vh = Math.pow(10, 3.99984385397 / 20);
    const Vb = Math.pow(Vh, 0.4996667741545416);
    const Q = 0.7071752369554193;
    const K = Math.tan((Math.PI * 1681.974450955533) / sr);
    const a0 = 1 + K / Q + K * K;
    stages.push([
      (Vh + (Vb * K) / Q + K * K) / a0,
      (2 * (K * K - Vh)) / a0,
      (Vh - (Vb * K) / Q + K * K) / a0,
      (2 * (K * K - 1)) / a0,
      (1 - K / Q + K * K) / a0,
    ]);
  }
  {
    const Q = 0.5003270373253953;
    const K = Math.tan((Math.PI * 38.13547087613982) / sr);
    const a0 = 1 + K / Q + K * K;
    stages.push([1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0]);
  }
  out.set(data);
  for (const [b0, b1, b2, a1, a2] of stages) {
    let z1 = 0;
    let z2 = 0;
    for (let i = 0; i < out.length; i++) {
      const x = out[i] as number;
      const y = b0 * x + z1;
      z1 = b1 * x - a1 * y + z2;
      z2 = b2 * x - a2 * y;
      out[i] = y;
    }
  }
  return out;
}

/** In-place radix-2 FFT (length must be a power of two). */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] as number, re[i] as number];
      [im[i], im[j]] = [im[j] as number, im[i] as number];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = (re[b] as number) * cr - (im[b] as number) * ci;
        const xi = (re[b] as number) * ci + (im[b] as number) * cr;
        re[b] = (re[a] as number) - xr;
        im[b] = (im[a] as number) - xi;
        re[a] = (re[a] as number) + xr;
        im[a] = (im[a] as number) + xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

function centroid(mono: Float32Array, sr: number): number {
  const N = 2048;
  const hop = 1024;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const frames: { c: number; e: number }[] = [];
  for (let s = 0; s + N <= mono.length; s += hop) {
    for (let i = 0; i < N; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      re[i] = (mono[s + i] as number) * w;
      im[i] = 0;
    }
    fft(re, im);
    let num = 0;
    let den = 0;
    let e = 0;
    for (let k = 1; k < N / 2; k++) {
      const p = (re[k] as number) ** 2 + (im[k] as number) ** 2;
      const m = Math.sqrt(p);
      num += m * ((k * sr) / N);
      den += m;
      e += p;
    }
    if (den > 0) frames.push({ c: num / den, e });
  }
  const maxE = frames.reduce((m, f) => Math.max(m, f.e), 0);
  let num = 0;
  let den = 0;
  for (const f of frames) {
    if (f.e < maxE * 1e-4) continue;
    num += f.c * f.e;
    den += f.e;
  }
  return den > 0 ? num / den : 0;
}

function loudness(channels: readonly Float32Array[], sr: number): { m: number; i: number } {
  const weighted = channels.map((c) => kWeight(c, sr));
  const win = Math.round(0.4 * sr);
  const hop = Math.round(0.1 * sr);
  const len = weighted[0]?.length ?? 0;
  const blocks: number[] = [];
  for (let s = 0; s + win <= Math.max(len, win); s += hop) {
    let z = 0;
    for (const w of weighted) {
      let sum = 0;
      const end = Math.min(len, s + win);
      for (let i = s; i < end; i++) sum += (w[i] as number) * (w[i] as number);
      z += sum / win;
    }
    blocks.push(z);
    if (s + win >= len) break;
  }
  const toL = (z: number): number => (z > 0 ? -0.691 + 10 * Math.log10(z) : SILENT);
  const m = blocks.reduce((best, z) => Math.max(best, toL(z)), SILENT);
  const abs = blocks.filter((z) => toL(z) > -70);
  if (abs.length === 0) return { m, i: SILENT };
  const mean = abs.reduce((a, b) => a + b, 0) / abs.length;
  const rel = abs.filter((z) => toL(z) > toL(mean) - 10);
  const i = rel.length > 0 ? toL(rel.reduce((a, b) => a + b, 0) / rel.length) : SILENT;
  return { m, i };
}

function duration(mono: Float32Array, sr: number): number {
  const step = Math.max(1, Math.round(0.01 * sr));
  const env: number[] = [];
  for (let s = 0; s < mono.length; s += step) {
    let sum = 0;
    const end = Math.min(mono.length, s + step);
    for (let i = s; i < end; i++) sum += (mono[i] as number) * (mono[i] as number);
    env.push(Math.sqrt(sum / (end - s)));
  }
  const top = Math.max(0, ...env);
  if (!(top > 0)) return 0;
  const gate = top * 0.0316;
  let first = -1;
  let last = -1;
  env.forEach((v, i) => {
    if (v >= gate) {
      if (first < 0) first = i;
      last = i;
    }
  });
  return first < 0 ? 0 : ((last - first + 1) * step) / sr;
}

/** Measures channels between `from` and `to` seconds. */
export function analyze(channels: readonly Float32Array[], sr: number, from = 0, to = Infinity): Metrics {
  const a = Math.max(0, Math.round(from * sr));
  const b = Math.min(channels[0]?.length ?? 0, Math.round(Math.min(to, 1e6) * sr));
  const cut = channels.map((c) => c.subarray(a, Math.max(a, b)));
  let peak = 0;
  for (const c of cut) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i] as number));
  const mono = new Float32Array(cut[0]?.length ?? 0);
  for (const c of cut) for (let i = 0; i < c.length; i++) mono[i] += (c[i] as number) / cut.length;
  const l = loudness(cut, sr);
  return {
    peakDb: db(peak),
    lufsM: l.m,
    lufsI: l.i,
    centroidHz: centroid(mono, sr),
    duration: duration(mono, sr),
  };
}
