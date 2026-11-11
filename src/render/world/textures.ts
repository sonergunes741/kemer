/**
 * Textures made at load time (tileable noise, water ripples, leaf clusters) and the loader for
 * the art team's texture sets, which always falls back to the procedural ones.
 */
import {
  CanvasTexture,
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  TextureLoader,
  UnsignedByteType,
  type Texture,
} from 'three';
import { hasTexture, textureUrls, type TextureSetId } from '../../core/assets';
import { log } from '../../core/log';
import { mulberry32 } from '../../core/rng';

/** Periodic gradient noise: tiles seamlessly with the given period (in lattice cells). */
function periodicNoise(seed: number): (x: number, y: number, period: number) => number {
  const rand = mulberry32(seed);
  const gx = new Float32Array(1024);
  const gy = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const a = rand() * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (ix: number, iy: number, period: number, dx: number, dy: number): number => {
    const h = ((((ix % period) + period) % period) * 73856093) ^ ((((iy % period) + period) % period) * 19349663);
    const k = (h >>> 0) % 1024;
    return gx[k]! * dx + gy[k]! * dy;
  };
  return (x, y, period) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = fade(xf);
    const v = fade(yf);
    const a = grad(xi, yi, period, xf, yf);
    const b = grad(xi + 1, yi, period, xf - 1, yf);
    const c = grad(xi, yi + 1, period, xf, yf - 1);
    const d = grad(xi + 1, yi + 1, period, xf - 1, yf - 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 1.41;
  };
}

function tileFbm(n: (x: number, y: number, p: number) => number, u: number, v: number, base: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let p = base;
  for (let i = 0; i < octaves; i++) {
    sum += n(u * p, v * p, p) * amp;
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

function makeData(size: number, data: Uint8Array, color: boolean): DataTexture {
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Four channels of tileable fbm at increasing frequency, for ground, rock, clouds and foam. */
export function createNoiseTexture(size = 256, seed = 7): DataTexture {
  const n = periodicNoise(seed);
  const data = new Uint8Array(size * size * 4);
  const bases = [3, 6, 16, 10];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;
      for (let c = 0; c < 4; c++) {
        let value = tileFbm(n, u + c * 0.13, v + c * 0.29, bases[c]!, 5);
        if (c === 3) value = 1 - Math.abs(value) * 2.2; // ridged: crack and vein patterns
        data[i + c] = Math.max(0, Math.min(255, Math.round((value * 0.5 + 0.5) * 255)));
      }
    }
  }
  // The channels are offset copies of one lattice; the u/v offsets break their alignment.
  return makeData(size, data, false);
}

/**
 * Tileable ripple field: RG hold the surface slope (x, z), B the height, A a foam pattern.
 * A sum of cosine waves with whole wave numbers, so it tiles exactly.
 */
export function createWaterTexture(size = 256, seed = 11): DataTexture {
  const rand = mulberry32(seed);
  const waves: { kx: number; ky: number; a: number; ph: number }[] = [];
  while (waves.length < 36) {
    const kx = Math.round((rand() * 2 - 1) * 16);
    const ky = Math.round((rand() * 2 - 1) * 16);
    const k = Math.hypot(kx, ky);
    if (k < 2 || k > 16) continue;
    waves.push({ kx, ky, a: 1 / Math.pow(k, 1.5), ph: rand() * Math.PI * 2 });
  }
  const sx = new Float32Array(size * size);
  const sy = new Float32Array(size * size);
  const hh = new Float32Array(size * size);
  let maxS = 1e-6;
  let maxH = 1e-6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let h = 0;
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        const t = Math.PI * 2 * (w.kx * u + w.ky * v) + w.ph;
        h += w.a * Math.cos(t);
        const s = -w.a * Math.sin(t) * Math.PI * 2;
        dx += s * w.kx;
        dy += s * w.ky;
      }
      const i = y * size + x;
      sx[i] = dx;
      sy[i] = dy;
      hh[i] = h;
      maxS = Math.max(maxS, Math.abs(dx), Math.abs(dy));
      maxH = Math.max(maxH, Math.abs(h));
    }
  }
  const foam = periodicNoise(seed + 3);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    data[i * 4] = Math.round((sx[i]! / maxS) * 127.5 + 127.5);
    data[i * 4 + 1] = Math.round((sy[i]! / maxS) * 127.5 + 127.5);
    data[i * 4 + 2] = Math.round((hh[i]! / maxH) * 127.5 + 127.5);
    const f = tileFbm(foam, x / size, y / size, 8, 4);
    data[i * 4 + 3] = Math.max(0, Math.min(255, Math.round((f * 0.5 + 0.5) * 255)));
  }
  return makeData(size, data, false);
}

/**
 * Leaf atlas, 2 x 2 cells: broad leaves, narrow leaves (willow, poplar), needles, and a dense
 * cluster for far trees. Grey values are a tint the plant shader multiplies by the season colour.
 */
export function createLeafAtlas(seed = 5): Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const rand = mulberry32(seed);
  ctx.clearRect(0, 0, size, size);
  const cell = size / 2;

  const leaves = (cx: number, cy: number, count: number, rx: [number, number], ry: [number, number], spread: number): void => {
    // Twigs first so leaves sit on them.
    ctx.strokeStyle = 'rgb(70,60,50)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const a = rand() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * spread * 0.9, cy + Math.sin(a) * spread * 0.9);
      ctx.stroke();
    }
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(rand()) * spread;
      const a = rand() * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      const g = Math.round(150 + rand() * 105);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx[0] + rand() * (rx[1] - rx[0]), ry[0] + rand() * (ry[1] - ry[0]), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  leaves(cell * 0.5, cell * 0.5, 85, [10, 17], [6, 10], 98);
  leaves(cell * 1.5, cell * 0.5, 120, [13, 22], [2.5, 4.5], 100);
  // Needles: sprays of short strokes along a few twigs.
  ctx.lineCap = 'round';
  for (let s = 0; s < 7; s++) {
    const a0 = rand() * Math.PI * 2;
    const ox = cell * 0.5 + Math.cos(a0) * 30;
    const oy = cell * 1.5 + Math.sin(a0) * 30;
    const dir = a0 + (rand() - 0.5);
    for (let k = 0; k < 26; k++) {
      const t = k / 26;
      const px = ox + Math.cos(dir) * t * 80;
      const py = oy + Math.sin(dir) * t * 80;
      for (const side of [-1, 1]) {
        const g = Math.round(120 + rand() * 90);
        ctx.strokeStyle = `rgb(${g},${g},${g})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        const na = dir + side * (0.9 + rand() * 0.3);
        ctx.lineTo(px + Math.cos(na) * 13, py + Math.sin(na) * 13);
        ctx.stroke();
      }
    }
  }
  leaves(cell * 1.5, cell * 1.5, 190, [9, 15], [6, 9], 108);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.userData['norm'] = textureNorm(canvas);
  return tex;
}

/**
 * 1 / the mean linear brightness of a leaf image's opaque texels: multiplying by it turns the
 * image into pure detail around 1, so the species colour sets the crown's colour whatever
 * texture it wears. 1 when there is no canvas to measure with (tests).
 */
export function textureNorm(source: CanvasImageSource & { width: number; height: number }): number {
  if (typeof document === 'undefined') return 1;
  const n = 64;
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 1;
  ctx.drawImage(source, 0, 0, n, n);
  const d = ctx.getImageData(0, 0, n, n).data;
  const lin = (v: number): number => Math.pow(v / 255, 2.2);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 128) continue;
    sum += lin(d[i]!) * 0.3 + lin(d[i + 1]!) * 0.59 + lin(d[i + 2]!) * 0.11;
    count++;
  }
  return count > 0 && sum > 0 ? Math.min(8, Math.max(0.5, count / sum)) : 1;
}

/**
 * The linear mean colour of a loaded colour texture (cached on it): dividing by it turns a photo
 * into detail around 1 that a biome colour can tint. Mid grey when it cannot be measured.
 */
export function meanColor(tex: Texture): Color {
  const cached = tex.userData['mean'] as Color | undefined;
  if (cached) return cached;
  const out = new Color(0.5, 0.5, 0.5);
  const image = tex.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (typeof document !== 'undefined' && image && image.width > 0) {
    const n = 32;
    const canvas = document.createElement('canvas');
    canvas.width = n;
    canvas.height = n;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(image, 0, 0, n, n);
      const d = ctx.getImageData(0, 0, n, n).data;
      const lin = (v: number): number => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < d.length; i += 4) {
        r += lin(d[i]!);
        g += lin(d[i + 1]!);
        b += lin(d[i + 2]!);
      }
      const count = d.length / 4;
      out.setRGB(r / count, g / count, b / count);
    }
  }
  tex.userData['mean'] = out;
  return out;
}

export interface TextureSet {
  readonly color: Texture;
  readonly normal: Texture;
  readonly arm: Texture;
}

const loader = new TextureLoader();
const cache = new Map<TextureSetId, Promise<TextureSet | null>>();

function loadOne(url: string, color: boolean): Promise<Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = color ? SRGBColorSpace : NoColorSpace;
        tex.wrapS = tex.wrapT = RepeatWrapping;
        // Trilinear with mips and anisotropy: ground seen at a grazing angle stays calm, not grainy.
        tex.minFilter = LinearMipmapLinearFilter;
        tex.magFilter = LinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 8;
        resolve(tex);
      },
      undefined,
      reject,
    );
  });
}

/** A texture set from the art team, or null (missing from the manifest or failed to load). */
export function loadTextureSet(id: TextureSetId): Promise<TextureSet | null> {
  if (!hasTexture(id)) return Promise.resolve(null);
  let p = cache.get(id);
  if (!p) {
    const urls = textureUrls(id);
    p = Promise.all([loadOne(urls.color, true), loadOne(urls.normal, false), loadOne(urls.arm, false)])
      .then(([color, normal, arm]) => ({ color, normal, arm }))
      .catch((err: unknown) => {
        log.warn('world', `texture set ${id} failed; using the procedural ground`, err);
        return null;
      });
    cache.set(id, p);
  }
  return p;
}
