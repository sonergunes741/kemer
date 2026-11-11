/**
 * The stone field: every stone of a layout merged into two meshes (dressed stone and paving), a
 * float texture with each stone's transform, and the bookkeeping to move, hide and pick stones.
 *
 * Texture layout: STONES_PER_ROW stones per row, three RGBA texels each:
 *   [pivot.xyz, scale]  [rotation quaternion]  [offset.xyz, dirt]
 * Offsets and rotations are relative to the as-built position; rotation is about the pivot.
 */
import { DataTexture, FloatType, Mesh, NearestFilter, Quaternion, RGBAFormat, Sphere, Vector3, type BufferGeometry, type Material } from 'three';
import type { Layout } from './layout';
import { MeshWriter, writeStone, type Cut } from './prism';
import type { StoneSpec } from './types';

export const STONES_PER_ROW = 256;

const _q = new Quaternion();
const _q2 = new Quaternion();
const _v = new Vector3();

export class StoneField {
  readonly count: number;
  readonly stones: readonly StoneSpec[];
  readonly xf: DataTexture;
  private readonly data: Float32Array;
  /** Rest bounding boxes: min.xyz, max.xyz per stone. */
  readonly boxes: Float32Array;
  /** Index range of each stone in its mesh, and which mesh (0 stone, 1 paving). */
  readonly ranges: Uint32Array;
  readonly geometries: [BufferGeometry, BufferGeometry];
  readonly meshes: Mesh[] = [];
  /** Small random seating of each stone (offset xyz, rotation xyz radians) so nothing looks stamped. */
  readonly seat: Float32Array;
  private dirty = true;

  constructor(layout: Layout, cut: (s: StoneSpec) => Cut, rng: () => number) {
    this.stones = layout.stones;
    const n = layout.stones.length;
    this.count = n;
    const rows = Math.max(1, Math.ceil(n / STONES_PER_ROW));
    this.data = new Float32Array(STONES_PER_ROW * 3 * rows * 4);
    this.xf = new DataTexture(this.data, STONES_PER_ROW * 3, rows, RGBAFormat, FloatType);
    this.xf.minFilter = NearestFilter;
    this.xf.magFilter = NearestFilter;
    this.xf.generateMipmaps = false;
    this.boxes = new Float32Array(n * 6);
    this.ranges = new Uint32Array(n * 3);
    this.seat = new Float32Array(n * 6);
    const writers = [new MeshWriter(), new MeshWriter()];
    layout.stones.forEach((s, i) => {
      const w = writers[s.material]!;
      const v0 = w.vCount;
      const r = writeStone(w, s.shape, i, cut(s));
      this.ranges[i * 3] = r.start;
      this.ranges[i * 3 + 1] = r.count;
      this.ranges[i * 3 + 2] = s.material;
      let x0 = Infinity;
      let y0 = Infinity;
      let z0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      let z1 = -Infinity;
      for (let v = v0; v < w.vCount; v++) {
        const x = w.pos[v * 3]!;
        const y = w.pos[v * 3 + 1]!;
        const z = w.pos[v * 3 + 2]!;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (z < z0) z0 = z;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
        if (z > z1) z1 = z;
      }
      this.boxes.set([x0, y0, z0, x1, y1, z1], i * 6);
      // Face stones sit a few millimetres proud or shy of the wall; every stone a hair off true.
      const face = s.kind === 'spandrel' || s.kind === 'abutment' || s.kind === 'parapet' || s.kind === 'pier';
      const proud = face ? (rng() - 0.35) * 0.012 : (rng() - 0.5) * 0.004;
      const dir = s.shape.plane === 'xy' ? Math.sign(s.pivot.z) : 0;
      this.seat.set([0, 0, proud * dir, (rng() - 0.5) * 0.004, (rng() - 0.5) * 0.004, (rng() - 0.5) * 0.004], i * 6);
      if (s.material === 1) this.seat.fill(0, i * 6, i * 6 + 6);
      this.setPose(i, 0, 0, 0, 0, 0, 0, 1, 1);
    });
    this.geometries = [writers[0]!.toGeometry(), writers[1]!.toGeometry()];
    for (const g of this.geometries) {
      g.computeBoundingBox();
      g.computeBoundingSphere();
    }
  }

  /** Make the two meshes with the given materials. */
  build(stone: Material, paving: Material, stoneDepth: Material): void {
    const a = new Mesh(this.geometries[0], stone);
    const b = new Mesh(this.geometries[1], paving);
    for (const m of [a, b]) {
      m.customDepthMaterial = stoneDepth;
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = 'kemer-stones';
    }
    this.meshes.push(a, b);
  }

  /** Let moved stones be drawn anywhere (collapse); the merged bounds no longer hold. */
  unbound(): void {
    for (const m of this.meshes) {
      m.frustumCulled = false;
      m.geometry.boundingSphere = new Sphere(new Vector3(), 1e5);
    }
  }

  /** Write a pose relative to the stone's seated rest position. */
  setPose(i: number, ox: number, oy: number, oz: number, qx: number, qy: number, qz: number, qw: number, scale: number): void {
    const s = this.stones[i]!;
    const seat = this.seat;
    const k = i * 6;
    // Compose the dynamic rotation with the small seating rotation (seat first).
    _q.set(seat[k + 3]! * 0.5, seat[k + 4]! * 0.5, seat[k + 5]! * 0.5, 1).normalize();
    _q.premultiply(_q2.set(qx, qy, qz, qw));
    const row = Math.floor(i / STONES_PER_ROW);
    const col = i - row * STONES_PER_ROW;
    const o = (row * STONES_PER_ROW * 3 + col * 3) * 4;
    const d = this.data;
    d[o] = s.pivot.x;
    d[o + 1] = s.pivot.y;
    d[o + 2] = s.pivot.z;
    d[o + 3] = scale;
    d[o + 4] = _q.x;
    d[o + 5] = _q.y;
    d[o + 6] = _q.z;
    d[o + 7] = _q.w;
    d[o + 8] = ox + seat[k]!;
    d[o + 9] = oy + seat[k + 1]!;
    d[o + 10] = oz + seat[k + 2]!;
    this.dirty = true;
  }

  setDirt(i: number, dirt: number): void {
    const row = Math.floor(i / STONES_PER_ROW);
    const col = i - row * STONES_PER_ROW;
    this.data[(row * STONES_PER_ROW * 3 + col * 3) * 4 + 11] = dirt;
    this.dirty = true;
  }

  /** Current offset and rotation of a stone (seating included). */
  pose(i: number, offset: Vector3, rot: Quaternion): number {
    const row = Math.floor(i / STONES_PER_ROW);
    const col = i - row * STONES_PER_ROW;
    const o = (row * STONES_PER_ROW * 3 + col * 3) * 4;
    const d = this.data;
    offset.set(d[o + 8]!, d[o + 9]!, d[o + 10]!);
    rot.set(d[o + 4]!, d[o + 5]!, d[o + 6]!, d[o + 7]!);
    return d[o + 3]!;
  }

  /** Upload the transforms if anything moved this frame. */
  flush(): void {
    if (!this.dirty) return;
    this.xf.needsUpdate = true;
    this.dirty = false;
  }

  /**
   * The stone a ray hits first among those `accept` allows: AABB test on every stone, then exact
   * triangles of the nearest candidates in the stone's own rest frame.
   */
  pick(origin: Vector3, dir: Vector3, accept: (i: number) => boolean): number {
    const cands: [number, number][] = [];
    const b = this.boxes;
    for (let i = 0; i < this.count; i++) {
      if (!accept(i)) continue;
      const t = rayBox(origin, dir, b, i * 6);
      if (t !== null) cands.push([t, i]);
    }
    cands.sort((p, q) => p[0] - q[0]);
    let best = -1;
    let bestT = Infinity;
    const off = new Vector3();
    const rot = new Quaternion();
    const o = new Vector3();
    const d = new Vector3();
    for (const [tBox, i] of cands) {
      if (tBox > bestT) break;
      const s = this.stones[i]!;
      this.pose(i, off, rot);
      rot.invert();
      // Ray into the stone's rest frame: undo offset, then rotation about the pivot.
      o.copy(origin).sub(off).sub(_v.set(s.pivot.x, s.pivot.y, s.pivot.z)).applyQuaternion(rot).add(_v);
      d.copy(dir).applyQuaternion(rot);
      const t = this.rayStone(i, o, d);
      if (t !== null && t < bestT) {
        bestT = t;
        best = i;
      }
    }
    return best;
  }

  private rayStone(i: number, o: Vector3, d: Vector3): number | null {
    const g = this.geometries[this.ranges[i * 3 + 2]!]!;
    const pos = g.getAttribute('position').array as Float32Array;
    const idx = g.getIndex()!.array as Uint32Array;
    const start = this.ranges[i * 3]!;
    const end = start + this.ranges[i * 3 + 1]!;
    let best: number | null = null;
    for (let k = start; k < end; k += 3) {
      const t = rayTri(o, d, pos, idx[k]!, idx[k + 1]!, idx[k + 2]!);
      if (t !== null && (best === null || t < best)) best = t;
    }
    return best;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    this.xf.dispose();
  }
}

function rayBox(o: Vector3, d: Vector3, b: Float32Array, k: number): number | null {
  let t0 = 0;
  let t1 = Infinity;
  const os = [o.x, o.y, o.z];
  const ds = [d.x, d.y, d.z];
  for (let a = 0; a < 3; a++) {
    const lo = b[k + a]! - 0.05;
    const hi = b[k + 3 + a]! + 0.05;
    const inv = 1 / (ds[a]! || 1e-12);
    let ta = (lo - os[a]!) * inv;
    let tb = (hi - os[a]!) * inv;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0;
}

function rayTri(o: Vector3, d: Vector3, p: Float32Array, a: number, b: number, c: number): number | null {
  const ax = p[a * 3]!;
  const ay = p[a * 3 + 1]!;
  const az = p[a * 3 + 2]!;
  const e1x = p[b * 3]! - ax;
  const e1y = p[b * 3 + 1]! - ay;
  const e1z = p[b * 3 + 2]! - az;
  const e2x = p[c * 3]! - ax;
  const e2y = p[c * 3 + 1]! - ay;
  const e2z = p[c * 3 + 2]! - az;
  const px = d.y * e2z - d.z * e2y;
  const py = d.z * e2x - d.x * e2z;
  const pz = d.x * e2y - d.y * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const tx = o.x - ax;
  const ty = o.y - ay;
  const tz = o.z - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return null;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (d.x * qx + d.y * qy + d.z * qz) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 1e-4 ? t : null;
}
