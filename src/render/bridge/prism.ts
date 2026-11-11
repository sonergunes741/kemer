/**
 * Turns stone outlines into real geometry: a prism (an outline extruded along one axis) with
 * bevelled edges, or a loft between two outlines for the odd shaped stone (cutwater caps).
 * Everything is written into one growing set of typed arrays so a whole bridge is a few buffers.
 *
 * Per vertex: position, an 8-bit normal, the stone's index (read by the shader to find its
 * transform) and a joint weight, 1 at the deep edge of a bevel and 0 on the face, which the shader
 * uses to darken the joints.
 */
import { BufferAttribute, BufferGeometry, Vector2, ShapeUtils } from 'three';
import type { Vec2 } from '../../core/types';
import { ccw, chamfer, inset, reduce, signedArea, simplify } from './poly';
import type { StoneShape } from './types';

export interface Cut {
  /** Width of the bevel on the faces, metres (0: sharp edges). */
  bevel: number;
  /** Chamfer of the long edges, metres (0: none). */
  chamfer: number;
  /** Gap between neighbouring stones, metres. */
  gap: number;
}

export class MeshWriter {
  pos = new Float32Array(3 * 4096);
  nrm = new Int8Array(3 * 4096);
  stone = new Float32Array(4096);
  joint = new Uint8Array(4096);
  idx = new Uint32Array(3 * 8192);
  vCount = 0;
  iCount = 0;

  private growV(extra: number): void {
    const need = this.vCount + extra;
    if (need <= this.stone.length) return;
    const size = Math.max(need, this.stone.length * 2);
    const pos = new Float32Array(size * 3);
    pos.set(this.pos);
    this.pos = pos;
    const nrm = new Int8Array(size * 3);
    nrm.set(this.nrm);
    this.nrm = nrm;
    const stone = new Float32Array(size);
    stone.set(this.stone);
    this.stone = stone;
    const joint = new Uint8Array(size);
    joint.set(this.joint);
    this.joint = joint;
  }

  private growI(extra: number): void {
    const need = this.iCount + extra;
    if (need <= this.idx.length) return;
    const idx = new Uint32Array(Math.max(need, this.idx.length * 2));
    idx.set(this.idx);
    this.idx = idx;
  }

  reserve(vertices: number, indices: number): void {
    this.growV(vertices);
    this.growI(indices);
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, stone: number, joint: number): number {
    this.growV(1);
    const v = this.vCount++;
    this.pos[v * 3] = x;
    this.pos[v * 3 + 1] = y;
    this.pos[v * 3 + 2] = z;
    const l = Math.hypot(nx, ny, nz) || 1;
    this.nrm[v * 3] = Math.round((nx / l) * 127);
    this.nrm[v * 3 + 1] = Math.round((ny / l) * 127);
    this.nrm[v * 3 + 2] = Math.round((nz / l) * 127);
    this.stone[v] = stone;
    this.joint[v] = Math.round(joint * 255);
    return v;
  }

  tri(a: number, b: number, c: number): void {
    this.growI(3);
    this.idx[this.iCount++] = a;
    this.idx[this.iCount++] = b;
    this.idx[this.iCount++] = c;
  }

  toGeometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos.slice(0, this.vCount * 3), 3));
    g.setAttribute('normal', new BufferAttribute(this.nrm.slice(0, this.vCount * 3), 3, true));
    g.setAttribute('aStone', new BufferAttribute(this.stone.slice(0, this.vCount), 1));
    g.setAttribute('aJoint', new BufferAttribute(this.joint.slice(0, this.vCount), 1, true));
    g.setIndex(new BufferAttribute(this.idx.slice(0, this.iCount), 1));
    return g;
  }
}

type Map3 = (u: number, v: number, w: number) => [number, number, number];

const MAPS: Record<StoneShape['plane'], { map: Map3; flip: boolean }> = {
  xy: { map: (u, v, w) => [u, v, w], flip: false },
  // Plan outlines (x, z) extruded up: a mirror of the right-handed frame, so windings flip.
  xz: { map: (u, v, w) => [u, w, v], flip: true },
  zy: { map: (u, v, w) => [w, v, u], flip: true },
};

function isConvex(p: readonly Vec2[]): boolean {
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % n]!;
    const c = p[(i + 2) % n]!;
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) < -1e-9) return false;
  }
  return true;
}

/** Triangles of a CCW polygon as index triples into it, each CCW. */
function triangulate(p: readonly Vec2[]): number[] {
  const n = p.length;
  const out: number[] = [];
  if (isConvex(p)) {
    for (let i = 1; i < n - 1; i++) out.push(0, i, i + 1);
    return out;
  }
  const tris = ShapeUtils.triangulateShape(
    p.map((q) => new Vector2(q.x, q.y)),
    [],
  );
  for (const t of tris) {
    const a = p[t[0]!]!;
    const b = p[t[1]!]!;
    const c = p[t[2]!]!;
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (cross >= 0) out.push(t[0]!, t[1]!, t[2]!);
    else out.push(t[0]!, t[2]!, t[1]!);
  }
  return out;
}

/** Write one stone. Returns the first index and the index count (0 when the shape was degenerate). */
export function writeStone(w: MeshWriter, shape: StoneShape, id: number, cut: Cut): { start: number; count: number } {
  const start = w.iCount;
  if (shape.top) writeLoft(w, shape, id);
  else writePrism(w, shape, id, cut);
  return { start, count: w.iCount - start };
}

function writePrism(w: MeshWriter, shape: StoneShape, id: number, cut: Cut): void {
  let poly = ccw(reduce(simplify(shape.poly), 0.004));
  if (poly.length < 3 || signedArea(poly) < 1e-5) return;
  const { map, flip } = MAPS[shape.plane];
  const tri = flip ? (a: number, b: number, c: number) => w.tri(a, c, b) : (a: number, b: number, c: number) => w.tri(a, b, c);
  const shrunk = cut.gap > 0 ? inset(poly, cut.gap / 2) : null;
  if (shrunk) poly = shrunk;
  const ch = chamfer(poly, cut.chamfer);
  const pts = ch.points;
  const n = pts.length;
  const depth = shape.w1 - shape.w0;
  let b = Math.min(cut.bevel, depth / 3);
  let inner = b > 0.002 ? inset(pts, b) : null;
  if (!inner) {
    b = 0;
    inner = pts;
  }
  const w0 = shape.w0;
  const w1 = shape.w1;

  // Outward edge normals of the CCW outline.
  const en: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const c = pts[(i + 1) % n]!;
    const ex = c.x - a.x;
    const ey = c.y - a.y;
    const l = Math.hypot(ex, ey) || 1;
    en.push([ey / l, -ex / l]);
  }
  const put = (p: Vec2, wv: number, nu: number, nv: number, nw: number, joint: number): number => {
    const [x, y, z] = map(p.x, p.y, wv);
    const [nx, ny, nz] = map(nu, nv, nw);
    return w.vertex(x, y, z, nx, ny, nz, id, joint);
  };
  const k = 0.7071;
  // One ring set per vertex normal: smooth vertices share theirs between both edges, sharp
  // corners get one set for each edge. A set: side at both ends, then front and back bevel.
  const ring = (i: number, nu: number, nv: number): number[] => {
    const p = pts[i]!;
    const set = [put(p, w0 + b, nu, nv, 0, 0), put(p, w1 - b, nu, nv, 0, 0)];
    if (b > 0) {
      const q = inner[i]!;
      // Bevel vertices carry 0.5 at the face edge and 1 at the joint, so the shader can tell a
      // bevel (>= 0.5 everywhere on it) from a face (0) and darken it towards the joint.
      set.push(put(q, w0, nu * k, nv * k, -k, 0.5), put(p, w0 + b, nu * k, nv * k, -k, 1), put(p, w1 - b, nu * k, nv * k, k, 1), put(q, w1, nu * k, nv * k, k, 0.5));
    }
    return set;
  };
  w.reserve(n * 12 + 2 * n, n * 18 + 6 * n);
  const outSet: number[][] = [];
  const inSet: number[][] = [];
  for (let i = 0; i < n; i++) {
    const prev = en[(i + n - 1) % n]!;
    const own = en[i]!;
    if (ch.sharp[i]) {
      inSet.push(ring(i, prev[0], prev[1]));
      outSet.push(ring(i, own[0], own[1]));
    } else {
      const x = prev[0] + own[0];
      const y = prev[1] + own[1];
      const l = Math.hypot(x, y) || 1;
      const set = ring(i, x / l, y / l);
      inSet.push(set);
      outSet.push(set);
    }
  }
  for (let i = 0; i < n; i++) {
    const A = outSet[i]!;
    const B = inSet[(i + 1) % n]!;
    tri(A[0]!, B[0]!, B[1]!);
    tri(A[0]!, B[1]!, A[1]!);
    if (b > 0) {
      tri(A[2]!, B[2]!, B[3]!);
      tri(A[2]!, B[3]!, A[3]!);
      tri(A[4]!, B[4]!, B[5]!);
      tri(A[4]!, B[5]!, A[5]!);
    }
  }
  const tris = triangulate(inner);
  const front: number[] = [];
  const back: number[] = [];
  for (const p of inner) {
    front.push(put(p, w0, 0, 0, -1, 0));
    back.push(put(p, w1, 0, 0, 1, 0));
  }
  for (let t = 0; t < tris.length; t += 3) {
    const i0 = tris[t]!;
    const i1 = tris[t + 1]!;
    const i2 = tris[t + 2]!;
    tri(back[i0]!, back[i1]!, back[i2]!);
    tri(front[i0]!, front[i2]!, front[i1]!);
  }
}

/** A stone between two outlines (same vertex count), flat shaded, no bevel. */
function writeLoft(w: MeshWriter, shape: StoneShape, id: number): void {
  const bottom = shape.poly;
  const top = shape.top!;
  const n = bottom.length;
  if (n < 3 || top.length !== n) return;
  const { map, flip } = MAPS[shape.plane];
  const orient = signedArea(bottom) >= 0;
  const B = orient ? bottom : [...bottom].reverse();
  const T = orient ? top : [...top].reverse();
  const P3 = (p: Vec2, wv: number): [number, number, number] => map(p.x, p.y, wv);
  const face = (pts: [number, number, number][]): void => {
    // Normal from the polygon (Newell), so degenerate corners do not matter.
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const c = pts[(i + 1) % pts.length]!;
      nx += (a[1] - c[1]) * (a[2] + c[2]);
      ny += (a[2] - c[2]) * (a[0] + c[0]);
      nz += (a[0] - c[0]) * (a[1] + c[1]);
    }
    if (Math.hypot(nx, ny, nz) < 1e-9) return;
    const s = flip ? -1 : 1;
    const ids = pts.map((p) => w.vertex(p[0], p[1], p[2], nx * s, ny * s, nz * s, id, 0));
    for (let i = 1; i < ids.length - 1; i++) {
      if (flip) w.tri(ids[0]!, ids[i + 1]!, ids[i]!);
      else w.tri(ids[0]!, ids[i]!, ids[i + 1]!);
    }
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    face([P3(B[i]!, shape.w0), P3(B[j]!, shape.w0), P3(T[j]!, shape.w1), P3(T[i]!, shape.w1)]);
  }
  face([...B].reverse().map((p) => P3(p, shape.w0)));
  if (Math.abs(signedArea(T)) > 1e-5) face(T.map((p) => P3(p, shape.w1)));
}
