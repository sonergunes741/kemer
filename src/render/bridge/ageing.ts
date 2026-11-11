/**
 * The centuries on the stones: the settlement when the centering is struck, every voussoir's
 * movement from the simulation (with the walls riding on the ring under them), pier settlement,
 * dead spans and piers, cracks as hinges open, riprap at protected pier feet, small plants in the
 * joints, and the earthquake rattle.
 */
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { Bus } from '../../core/bus';
import type { FxApi } from '../../core/contracts';
import type { BridgeState } from '../../core/types';
import { clamp01, easeOutCubic } from '../../core/math';
import { mulberry32 } from '../../core/rng';
import { Cracks, type OpenHinge } from './crack';
import type { BridgeModel } from './model';

/**
 * The simulation's movements are true to scale: often a centimetre or two before anything opens,
 * which reads as nothing at the distances the game uses. Small movements are drawn up to twice
 * their size; large ones (a settled pier can move half a metre) are drawn as they are.
 */
function exaggerate(dx: number, dy: number): number {
  return 1 + Math.exp(-Math.hypot(dx, dy) / 0.03);
}
const RIPRAP_PER_PIER = 28;
const TUFTS = 90;

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();

export class Ageing {
  readonly group = new Group();
  /** Crown drop of each designed span at the strike, metres, as currently shown. */
  private readonly drops: Float32Array;
  private state: BridgeState | null = null;
  private readonly ringStones = new Map<number, number[]>();
  private readonly followers: number[] = [];
  private readonly pierStones = new Map<number, number[]>();
  private readonly seen = new Set<string>();
  private settleAnim: { t: number; from: Float32Array; to: readonly number[]; done: () => void } | null = null;
  private shake = 0;
  private shakeAmp = 0;
  private readonly rng: () => number;
  private riprap: InstancedMesh | null = null;
  private tufts: InstancedMesh | null = null;
  private readonly tuftSpots: { stone: number; m: Matrix4 }[] = [];
  private readonly crackLines: Cracks;
  private crackKey = '';

  constructor(
    private readonly model: BridgeModel,
    private readonly bus: Bus,
    private readonly fx: FxApi,
    private readonly particles: number,
  ) {
    this.drops = new Float32Array(model.geometry.spans.length);
    this.rng = mulberry32((model.level.site.seed ^ 0x2c1b3c6d) >>> 0);
    model.stones.forEach((s, i) => {
      if (s.arcade) return;
      if (s.kind === 'voussoir' || s.kind === 'keystone') {
        const key = s.span * 4096 + s.voussoir;
        const list = this.ringStones.get(key) ?? [];
        list.push(i);
        this.ringStones.set(key, list);
      } else if (s.follow[0] >= 0) this.followers.push(i);
      const pier = s.kind === 'pier' ? s.pier : s.followPier;
      if (pier >= 0) {
        const list = this.pierStones.get(pier) ?? [];
        list.push(i);
        this.pierStones.set(pier, list);
      }
    });
    this.makeRiprap();
    this.makeTufts();
    this.crackLines = new Cracks(model);
    this.group.add(this.crackLines.mesh);
  }

  /** The ring settles by `drops[span]` as the joints close. */
  settle(drops: readonly number[], seconds = 1.2): Promise<void> {
    this.settleAnim?.done();
    return new Promise((resolve) => {
      this.settleAnim = { t: 0, from: this.drops.slice(), to: drops, done: resolve };
      const g = this.model.geometry;
      drops.forEach((d, s) => {
        const span = g.spans[s];
        if (span && d > 0) this.bus.emit('arch:settle', { at: { x: span.crown.x, y: span.crown.y, z: g.width / 2 }, span: s, drop: d });
      });
      if (seconds <= 0) this.settleAnim.t = Infinity;
    });
  }

  apply(state: BridgeState): void {
    this.state = state;
    const u = this.model.uniforms;
    u.uMoss.value = clamp01(state.moss);
    u.uPatina.value = clamp01(state.patina);
    let loss = 0;
    for (const s of state.spans) loss = Math.max(loss, s.jointLoss);
    u.uJoint.value = clamp01(loss / 0.06);
    const gone = this.model.gone;
    state.spans.forEach((s, si) => {
      if (s.alive) return;
      for (const [key, list] of this.ringStones) if (Math.floor(key / 4096) === si) for (const i of list) gone[i] = 1;
      for (const i of this.followers) if (this.model.stones[i]!.follow[0] === si) gone[i] = 1;
    });
    state.piers.forEach((p, pi) => {
      if (!p.alive) for (const i of this.pierStones.get(pi) ?? []) gone[i] = 1;
    });
    this.cracks(state);
    this.recompose();
    this.placeRiprap(state);
    this.placeTufts(state.growth);
  }

  /** New hinges open with a crack: a sound, a darker joint, a line on both faces. */
  private cracks(state: BridgeState): void {
    const h = this.model.geometry.width / 2;
    const open: OpenHinge[] = [];
    state.spans.forEach((s, si) => {
      if (!s.alive) return;
      for (const hinge of s.hinges) {
        open.push({ span: si, hinge });
        const key = `${si}:${hinge.joint}:${hinge.side}`;
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        this.bus.emit('crack', { at: { x: hinge.at.x, y: hinge.at.y, z: h } });
        for (const v of [hinge.joint - 1, hinge.joint]) {
          for (const i of this.ringStones.get(si * 4096 + v) ?? []) this.model.field.setDirt(i, 0.45);
        }
      }
    });
    const key = open.map((o) => `${o.span}:${o.hinge.joint}:${o.hinge.side}`).join(',');
    if (key !== this.crackKey) {
      this.crackKey = key;
      this.crackLines.set(open);
    }
  }

  /** Base pose of every stone: strike settlement plus the simulation's movements. */
  private recompose(): void {
    const m = this.model;
    const g = m.geometry;
    const b = m.base;
    const st = this.state;
    b.fill(0);
    for (const [key, list] of this.ringStones) {
      const si = Math.floor(key / 4096);
      const v = key - si * 4096;
      const span = g.spans[si];
      if (!span) continue;
      const n = span.voussoirs.length;
      const settle = -this.drops[si]! * Math.sin((Math.PI * (v + 0.5)) / n);
      const shift = st?.spans[si]?.shifts[v];
      const k = shift ? exaggerate(shift.dx, shift.dy) : 1;
      for (const i of list) {
        b[i * 3] = (shift?.dx ?? 0) * k;
        b[i * 3 + 1] = settle + (shift?.dy ?? 0) * k;
        b[i * 3 + 2] = (shift?.rot ?? 0) * k;
      }
    }
    // Walls ride rigidly on the voussoir under them, about its centroid.
    for (const i of this.followers) {
      const s = m.stones[i]!;
      const [si, v] = s.follow;
      const ring = this.ringStones.get(si * 4096 + v);
      const c = g.spans[si]?.voussoirs[v]?.centroid;
      if (!ring || !c) continue;
      const r = ring[0]!;
      const dx = b[r * 3]!;
      const dy = b[r * 3 + 1]!;
      const rot = b[r * 3 + 2]!;
      const px = s.pivot.x - c.x;
      const py = s.pivot.y - c.y;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      b[i * 3] = px * cos - py * sin - px + dx;
      b[i * 3 + 1] = px * sin + py * cos - py + dy;
      b[i * 3 + 2] = rot;
    }
    if (st) {
      st.piers.forEach((p, pi) => {
        const drop = p.settlement * exaggerate(0, p.settlement);
        if (drop !== 0) for (const i of this.pierStones.get(pi) ?? []) b[i * 3 + 1] = b[i * 3 + 1]! - drop;
      });
    }
    for (let i = 0; i < m.count; i++) m.writePose(i);
  }

  /** Rattle the stones and shake dust out of the joints. */
  tremor(strength: number): void {
    const s = Math.max(0, strength);
    this.shake = Math.min(2.5, 0.8 + s * 1.5);
    this.shakeAmp = Math.min(0.03, 0.004 + s * 0.012);
    const g = this.model.geometry;
    const n = Math.round((3 + s * 8) * this.particles);
    for (let k = 0; k < n; k++) {
      const span = g.spans[Math.floor(this.rng() * g.spans.length)];
      if (!span) continue;
      const x = span.left.x + this.rng() * span.span;
      // There is no bus event for a tremor: the dust is raised on the world directly.
      this.fx.dust('fall', { x, y: span.crown.y - 0.1, z: (this.rng() - 0.5) * g.width }, 0.4 + s * 0.6);
    }
  }

  update(dt: number): void {
    const a = this.settleAnim;
    if (a) {
      a.t += dt;
      const e = easeOutCubic(clamp01(a.t / 1.2));
      for (let s = 0; s < this.drops.length; s++) this.drops[s] = a.from[s]! + ((a.to[s] ?? 0) - a.from[s]!) * e;
      this.recompose();
      if (e >= 1) {
        this.settleAnim = null;
        a.done();
      }
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const amp = this.shakeAmp * Math.min(1, this.shake);
      const m = this.model;
      for (let i = 0; i < m.count; i++) {
        if (!m.laid[i] || m.gone[i]) continue;
        // Higher stones swing more: the ground moves the feet, the deck lags behind.
        const k = amp * (0.3 + clamp01((m.stones[i]!.pivot.y + 2) / 12));
        _q.set((this.rng() - 0.5) * k * 0.5, 0, (this.rng() - 0.5) * k * 0.5, 1).normalize();
        m.writeAnimated(i, (this.rng() - 0.5) * k, (this.rng() - 0.5) * k * 0.5, (this.rng() - 0.5) * k * 0.3, _q);
      }
      if (this.shake === 0) for (let i = 0; i < m.count; i++) m.writePose(i);
    }
  }

  private makeRiprap(): void {
    const piers = this.model.geometry.piers;
    if (piers.length === 0) return;
    const geo = new IcosahedronGeometry(1, 0);
    const mat = new MeshStandardMaterial({ color: 0x8a8378, roughness: 0.95, flatShading: true });
    this.riprap = new InstancedMesh(geo, mat, piers.length * RIPRAP_PER_PIER);
    this.riprap.count = 0;
    this.riprap.castShadow = true;
    this.riprap.receiveShadow = true;
    this.riprap.name = 'kemer-riprap';
    this.group.add(this.riprap);
  }

  private placeRiprap(state: BridgeState): void {
    const mesh = this.riprap;
    if (!mesh) return;
    let n = 0;
    const h = this.model.geometry.width / 2;
    this.model.geometry.piers.forEach((p, pi) => {
      const ps = state.piers[pi];
      if (!ps || !ps.alive || ps.protection <= 0) return;
      const count = Math.round(clamp01(ps.protection / 0.6) * RIPRAP_PER_PIER);
      const rng = mulberry32((this.model.level.site.seed + pi * 977) >>> 0);
      for (let k = 0; k < count; k++) {
        // A ring of rough blocks around the footprint, heaped against the upstream nose.
        const a = (k / RIPRAP_PER_PIER) * Math.PI * 2 + rng() * 0.3;
        const rx = p.width / 2 + 0.35 + rng() * 0.5;
        const rz = h + 0.4 + rng() * 0.6 + (Math.sin(a) > 0 ? 0.4 : 0);
        const size = 0.22 + rng() * 0.25;
        _p.set(p.x + Math.cos(a) * rx, p.bed - ps.settlement + size * 0.35, Math.sin(a) * rz);
        _q.setFromAxisAngle(_s.set(rng(), rng(), rng()).normalize(), rng() * 3);
        _s.set(size * (0.8 + rng() * 0.5), size * 0.7, size * (0.8 + rng() * 0.5));
        mesh.setMatrixAt(n++, _m.compose(_p, _q, _s));
      }
    });
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** Small plants: in the joints of the faces, more of them low down and in the shade. */
  private makeTufts(): void {
    const geo = tuftGeometry();
    const mat = new MeshStandardMaterial({ color: new Color(0x6b7a3c), roughness: 1, side: DoubleSide, vertexColors: true });
    const count = Math.round(TUFTS * Math.max(0.3, this.particles));
    this.tufts = new InstancedMesh(geo, mat, count);
    this.tufts.count = 0;
    this.tufts.name = 'kemer-growth';
    this.tufts.receiveShadow = true;
    this.group.add(this.tufts);
    const m = this.model;
    const b = m.field.boxes;
    const spots: { stone: number; m: Matrix4; key: number }[] = [];
    m.stones.forEach((s, i) => {
      if (s.shape.plane !== 'xy' || !(s.kind === 'spandrel' || s.kind === 'abutment' || s.kind === 'pier' || s.kind === 'parapet')) return;
      if (Math.abs(s.pivot.z) < m.geometry.width / 2 - 0.6) return;
      const x = b[i * 6]! + (b[i * 6 + 3]! - b[i * 6]!) * (0.2 + 0.6 * this.rng());
      const y = b[i * 6 + 4]!;
      const z = s.pivot.z > 0 ? b[i * 6 + 5]! : b[i * 6 + 2]!;
      const size = 0.6 + this.rng() * 0.9;
      _q.setFromAxisAngle(_s.set(0, 1, 0), this.rng() * Math.PI);
      const mat4 = new Matrix4().compose(_p.set(x, y - 0.02, z), _q, _s.set(size, size, size));
      // Damp and low first: a lower key comes earlier as growth spreads.
      spots.push({ stone: i, m: mat4, key: this.rng() + clamp01((y - 0) / 10) * 1.5 });
    });
    spots.sort((p, q) => p.key - q.key);
    for (const s of spots.slice(0, count)) this.tuftSpots.push({ stone: s.stone, m: s.m });
  }

  private placeTufts(growth: number): void {
    const mesh = this.tufts;
    if (!mesh) return;
    const want = Math.round(clamp01(growth) * this.tuftSpots.length);
    let n = 0;
    for (let k = 0; k < want; k++) {
      const spot = this.tuftSpots[k]!;
      if (this.model.gone[spot.stone]) continue;
      mesh.setMatrixAt(n++, spot.m);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.crackLines.dispose();
    for (const mesh of [this.riprap, this.tufts]) {
      if (!mesh) continue;
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    }
    this.settleAnim?.done();
    this.settleAnim = null;
  }
}

/** A tuft of grass: a fan of thin blades, darker at the root, leaning out from the joint. */
function tuftGeometry(): BufferGeometry {
  const rng = mulberry32(0x7af7);
  const pos: number[] = [];
  const col: number[] = [];
  const blades = 9;
  for (let k = 0; k < blades; k++) {
    const a = (k / blades) * Math.PI * 2 + rng() * 0.5;
    const lean = 0.25 + rng() * 0.5;
    const len = 0.12 + rng() * 0.14;
    const w = 0.012 + rng() * 0.008;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    // Base across the blade, tip out and up.
    pos.push(-cz * w, 0, cx * w, cz * w, 0, -cx * w, cx * len * lean, len, cz * len * lean);
    const tip = 0.85 + rng() * 0.3;
    col.push(0.45, 0.45, 0.4, 0.45, 0.45, 0.4, tip, tip * 1.02, tip * 0.8);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  return g;
}
