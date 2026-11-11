/**
 * Procedural plant and rock geometry, used whenever the art team's model is missing. Trees are a
 * tapered trunk with limbs and twigs (so winter shows a real bare tree) and a crown of alpha-cut
 * leaf cards whose normals point out of the crown, which lights them as one soft mass.
 *
 * Attributes: aKind (0 wood, 1 leaf, 2 grass blade, 3 rock), aAO (baked occlusion), aFlex (how
 * much the wind moves the vertex) and aRand (per card or part: colour and leaf-fall order).
 */
import { BufferAttribute, BufferGeometry, IcosahedronGeometry, Vector3 } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../core/rng';
import type { SpeciesId } from './biomes';
import { createNoise2 } from './noise';

class Builder {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly uv: number[] = [];
  readonly kind: number[] = [];
  readonly ao: number[] = [];
  readonly flex: number[] = [];
  readonly rand: number[] = [];
  readonly index: number[] = [];

  vertex(p: Vector3, n: Vector3, u: number, v: number, kind: number, ao: number, flex: number, rand: number): number {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.kind.push(kind);
    this.ao.push(ao);
    this.flex.push(flex);
    this.rand.push(rand);
    return this.pos.length / 3 - 1;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('aKind', new BufferAttribute(new Float32Array(this.kind), 1));
    g.setAttribute('aAO', new BufferAttribute(new Float32Array(this.ao), 1));
    g.setAttribute('aFlex', new BufferAttribute(new Float32Array(this.flex), 1));
    g.setAttribute('aRand', new BufferAttribute(new Float32Array(this.rand), 1));
    g.setIndex(this.index);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const UP = new Vector3(0, 1, 0);

/** A tapered tube from a to b with `sides` faces. */
function limb(b: Builder, a: Vector3, c: Vector3, r0: number, r1: number, sides: number, height: number, rand: number): void {
  const axis = c.clone().sub(a);
  const len = axis.length();
  axis.normalize();
  const t1 = Math.abs(axis.y) < 0.95 ? new Vector3().crossVectors(axis, UP).normalize() : new Vector3(1, 0, 0);
  const t2 = new Vector3().crossVectors(axis, t1).normalize();
  const rings = len > 3 ? 3 : 2;
  const start = b.pos.length / 3;
  for (let r = 0; r < rings; r++) {
    const t = r / (rings - 1);
    const centre = a.clone().addScaledVector(axis, t * len);
    const radius = r0 + (r1 - r0) * t;
    for (let s = 0; s <= sides; s++) {
      const ang = (s / sides) * Math.PI * 2;
      const n = t1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t2, Math.sin(ang));
      const p = centre.clone().addScaledVector(n, radius);
      const flex = Math.pow(Math.max(p.y, 0) / height, 2) * 0.6;
      b.vertex(p, n, 0, 0, 0, 0.55 + 0.45 * Math.min(1, p.y / height + 0.3), flex, rand);
    }
  }
  for (let r = 0; r < rings - 1; r++) {
    for (let s = 0; s < sides; s++) {
      const i0 = start + r * (sides + 1) + s;
      const i1 = i0 + sides + 1;
      b.index.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
    }
  }
}

/** One leaf card. `cell` picks the atlas quadrant; normals bend out of the crown centre. */
function card(b: Builder, c: Vector3, centre: Vector3, w: number, h: number, normal: Vector3, cell: number, height: number, ao: number, rand: number, hang = false): void {
  const n = normal.clone().normalize();
  const side = hang ? new Vector3().crossVectors(UP, n).normalize() : new Vector3().crossVectors(Math.abs(n.y) < 0.9 ? UP : new Vector3(1, 0, 0), n).normalize();
  const up = new Vector3().crossVectors(n, side).normalize();
  const out = c.clone().sub(centre).normalize();
  const shade = out.lerp(n, 0.25).normalize();
  const u0 = (cell % 2) * 0.5;
  const v0 = cell < 2 ? 0.5 : 0;
  const start = b.pos.length / 3;
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const [sx, sy] of corners) {
    const p = c.clone().addScaledVector(side, (sx * w) / 2).addScaledVector(up, (sy * h) / 2);
    const flex = 0.35 + Math.pow(Math.max(p.y, 0) / height, 2) * 0.65;
    b.vertex(p, shade, u0 + (sx * 0.5 + 0.5) * 0.5, v0 + (sy * 0.5 + 0.5) * 0.5, 1, ao, flex, rand);
  }
  b.index.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

interface CrownSpec {
  /** Crown lobes: centre (relative to height) and radii (metres). */
  readonly lobes: readonly { x: number; y: number; z: number; rx: number; ry: number; rz: number }[];
  readonly cards: number;
  readonly size: readonly [number, number];
  readonly cell: number;
  readonly hang?: boolean;
}

function crown(b: Builder, rng: () => number, spec: CrownSpec, height: number, lod: number): void {
  const count = Math.round(spec.cards * (lod === 0 ? 1 : 0.4));
  const scale = lod === 0 ? 1 : 1.5;
  const cell = lod === 0 ? spec.cell : spec.cell === 2 ? 2 : 3;
  const mid = new Vector3();
  for (const l of spec.lobes) mid.add(new Vector3(l.x, l.y, l.z));
  mid.multiplyScalar(1 / spec.lobes.length);
  for (let i = 0; i < count; i++) {
    const l = spec.lobes[Math.floor(rng() * spec.lobes.length)]!;
    // Points biased to the shell of each lobe: the inside of a real crown is mostly branches.
    const dir = new Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
    if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
    dir.normalize();
    const r = 0.55 + 0.45 * Math.sqrt(rng());
    const c = new Vector3(l.x + dir.x * l.rx * r, l.y + dir.y * l.ry * r, l.z + dir.z * l.rz * r);
    const centre = new Vector3(l.x, l.y, l.z);
    const out = c.clone().sub(centre);
    const ao = 0.5 + 0.5 * Math.min(1, Math.max(0, (dir.y * 0.5 + 0.5) * 0.6 + r * 0.5));
    const n = spec.hang ? new Vector3(out.x, 0, out.z).normalize() : out.clone().normalize().add(new Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(1.4));
    if (n.lengthSq() < 1e-4) n.set(1, 0, 0);
    const s = spec.size[0] + rng() * (spec.size[1] - spec.size[0]);
    const w = s * scale;
    const h = (spec.hang ? s * 2.4 : s) * scale;
    card(b, c, mid, w, h, n, cell, height, ao, rng(), spec.hang);
  }
}

/** Trunk plus limbs ending in the crown lobes, plus twigs for the winter silhouette. */
function wood(b: Builder, rng: () => number, height: number, trunkTop: number, radius: number, lobes: CrownSpec['lobes'], twigs: number, lod: number): void {
  const sides = lod === 0 ? 7 : 5;
  const top = new Vector3((rng() - 0.5) * 0.3, trunkTop, (rng() - 0.5) * 0.3);
  limb(b, new Vector3(0, -0.4, 0), top, radius, radius * 0.6, sides, height, 0.5);
  if (lod > 0) return;
  for (const l of lobes) {
    const end = new Vector3(l.x, l.y + l.ry * 0.2, l.z);
    limb(b, top, end, radius * 0.45, radius * 0.12, 5, height, rng());
    for (let t = 0; t < twigs; t++) {
      const from = top.clone().lerp(end, 0.4 + rng() * 0.5);
      const to = from.clone().add(new Vector3((rng() - 0.5) * l.rx * 1.4, (rng() * 0.8 + 0.1) * l.ry, (rng() - 0.5) * l.rz * 1.4));
      limb(b, from, to, radius * 0.12, radius * 0.03, 3, height, rng());
    }
  }
}

function tree(species: SpeciesId, lod: number, seed: number): BufferGeometry {
  const rng = mulberry32(seed);
  const b = new Builder();
  switch (species) {
    case 'poplar': {
      const H = 18;
      const lobes = [0.42, 0.6, 0.78].map((y, i) => ({ x: (rng() - 0.5) * 0.4, y: y * H, z: (rng() - 0.5) * 0.4, rx: 1.6 - i * 0.25, ry: 3.6, rz: 1.6 - i * 0.25 }));
      wood(b, rng, H, 0.85 * H, 0.3, lobes, 3, lod);
      crown(b, rng, { lobes, cards: 150, size: [1.1, 1.5], cell: 1 }, H, lod);
      break;
    }
    case 'willow': {
      const H = 10;
      const lobes = [0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + rng();
        return { x: Math.cos(a) * 2, y: 0.62 * H, z: Math.sin(a) * 2, rx: 2.8, ry: 2.6, rz: 2.8 };
      });
      wood(b, rng, H, 0.38 * H, 0.42, lobes, 3, lod);
      crown(b, rng, { lobes, cards: 160, size: [0.7, 1.0], cell: 1, hang: true }, H, lod);
      break;
    }
    case 'plane':
    case 'oak': {
      const H = species === 'plane' ? 19 : 13;
      const R = species === 'plane' ? 6.2 : 5;
      const lobes = [0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2 + rng() * 0.8;
        const d = i === 4 ? 0 : R * 0.45;
        return { x: Math.cos(a) * d, y: (i === 4 ? 0.78 : 0.6 + rng() * 0.1) * H, z: Math.sin(a) * d, rx: R * 0.55, ry: R * 0.42, rz: R * 0.55 };
      });
      wood(b, rng, H, (species === 'plane' ? 0.42 : 0.35) * H, species === 'plane' ? 0.55 : 0.48, lobes, 3, lod);
      crown(b, rng, { lobes, cards: species === 'plane' ? 190 : 160, size: [1.7, 2.3], cell: 0 }, H, lod);
      break;
    }
    case 'fruit': {
      const H = 4.6;
      const lobes = [0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + rng();
        return { x: Math.cos(a) * 0.8, y: 0.66 * H, z: Math.sin(a) * 0.8, rx: 1.5, ry: 1.1, rz: 1.5 };
      });
      wood(b, rng, H, 0.4 * H, 0.15, lobes, 3, lod);
      crown(b, rng, { lobes, cards: 80, size: [0.9, 1.2], cell: 0 }, H, lod);
      break;
    }
    case 'spruce': {
      const H = 17;
      limb(b, new Vector3(0, -0.4, 0), new Vector3(0, H, 0), 0.32, 0.04, lod === 0 ? 6 : 4, H, 0.5);
      const count = lod === 0 ? 180 : 70;
      for (let i = 0; i < count; i++) {
        const t = 0.12 + 0.88 * Math.pow(rng(), 0.8);
        const radius = 3.1 * Math.pow(1 - t, 0.95) + 0.25;
        const a = rng() * Math.PI * 2;
        const r = radius * (0.55 + 0.45 * rng());
        const c = new Vector3(Math.cos(a) * r, t * H, Math.sin(a) * r);
        // Sprays droop outwards and down like real spruce boughs.
        const n = new Vector3(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5).normalize();
        const s = (1.0 + rng() * 0.6) * (lod === 0 ? 1 : 1.6) * (0.7 + (1 - t) * 0.6);
        card(b, c, new Vector3(0, t * H, 0), s * 1.3, s, n, 2, H, 0.45 + 0.55 * (r / (radius + 0.01)) * (0.5 + t * 0.5), rng());
      }
      break;
    }
    case 'bush': {
      const H = 1.7;
      const lobes = [0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + rng();
        return { x: Math.cos(a) * 0.5, y: 0.75, z: Math.sin(a) * 0.5, rx: 0.9, ry: 0.65, rz: 0.9 };
      });
      for (const l of lobes) limb(b, new Vector3(0, -0.2, 0), new Vector3(l.x, l.y, l.z), 0.06, 0.02, 4, H, rng());
      crown(b, rng, { lobes, cards: lod === 0 ? 50 : 40, size: [0.7, 1.0], cell: 0 }, H, lod);
      break;
    }
    default:
      break;
  }
  return b.build();
}

/** A clump of reeds: thin bent blades. */
function reeds(seed: number): BufferGeometry {
  const rng = mulberry32(seed);
  const b = new Builder();
  const blades = 34;
  for (let i = 0; i < blades; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 0.7;
    const base = new Vector3(Math.cos(a) * r, -0.1, Math.sin(a) * r);
    const h = 1.5 + rng() * 1.1;
    const lean = new Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.15 + rng() * 0.35);
    const w = 0.035 + rng() * 0.025;
    const side = new Vector3(-Math.sin(a + 1.2), 0, Math.cos(a + 1.2));
    const n = new Vector3().crossVectors(side, UP).normalize();
    const rand = rng();
    const start = b.pos.length / 3;
    const segs = 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const centre = base.clone().add(new Vector3(0, t * h, 0)).addScaledVector(lean, t * t * h);
      const width = w * (1 - t * 0.85);
      const ao = 0.45 + 0.55 * t;
      b.vertex(centre.clone().addScaledVector(side, -width), n, 0, t, 2, ao, t * t, rand);
      b.vertex(centre.clone().addScaledVector(side, width), n, 1, t, 2, ao, t * t, rand);
    }
    for (let s = 0; s < segs; s++) {
      const i0 = start + s * 2;
      b.index.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
    }
  }
  return b.build();
}

/** A weathered boulder: a noisy, flattened icosahedron, half sunk into the ground. */
function rock(seed: number): BufferGeometry {
  const ico = new IcosahedronGeometry(1, 2);
  const noise = createNoise2(seed);
  const p = ico.getAttribute('position');
  const b = new Builder();
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = 1 + noise(v.x * 1.3 + v.z, v.y * 1.3) * 0.28 + noise(v.x * 3.1, v.z * 3.1 + v.y) * 0.08;
    v.multiplyScalar(d);
    v.y = v.y * 0.62 - 0.12;
    v.x *= 1.15;
    b.vertex(v, v.clone().normalize(), 0, 0, 3, 0.55 + 0.45 * Math.min(1, Math.max(0, v.y + 0.5)), 0, Math.abs(noise(v.x * 5, v.z * 5)));
  }
  const index = ico.index;
  if (index) for (let i = 0; i < index.count; i++) b.index.push(index.getX(i));
  else for (let i = 0; i < p.count; i++) b.index.push(i);
  ico.dispose();
  // The icosahedron arrives unindexed; weld it so the boulder shades smooth, not faceted.
  const g = mergeVertices(b.build());
  g.computeVertexNormals();
  return g;
}

/** Geometry for a species at a level of detail (0 near, 1 far). */
export function plantGeometry(species: SpeciesId, lod: number, seed = 1): BufferGeometry {
  if (species === 'reeds') return reeds(seed);
  if (species === 'rock') return rock(seed);
  return tree(species, lod, seed * 31 + 7);
}
