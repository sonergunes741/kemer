/**
 * The family mark cut into the upstream face of a voussoir: strokes between the points of a
 * 3 x 3 grid, drawn as thin grooves that share the stone's transform (so the mark moves, ages and
 * falls with its stone) and are shaded like a deep joint.
 */
import { BufferAttribute, BufferGeometry, Mesh, type MeshStandardMaterial } from 'three';
import type { StoneRef } from '../../core/contracts';
import type { FamilyMark, Vec2, Vec3 } from '../../core/types';
import type { BridgeModel } from './model';
import { stoneMaterial } from './materials';

const GROOVE = 0.022;

/** The upstream piece of a ring course (the one the camera sees), or -1. */
export function faceStone(model: BridgeModel, ref: StoneRef): number {
  let best = -1;
  model.stones.forEach((s, i) => {
    if ((s.kind !== 'voussoir' && s.kind !== 'keystone') || s.arcade || s.span !== ref.span || s.voussoir !== ref.stone) return;
    if (best < 0 || s.pivot.z > model.stones[best]!.pivot.z) best = i;
  });
  return best;
}

export class Mark {
  readonly mesh: Mesh;
  readonly at: Vec3;
  private readonly material: MeshStandardMaterial;
  private readonly quads: number;

  constructor(
    model: BridgeModel,
    readonly stone: number,
    mark: FamilyMark,
  ) {
    const s = model.stones[stone]!;
    const b = model.field.boxes;
    const k = stone * 6;
    const size = Math.min(b[k + 3]! - b[k]!, b[k + 4]! - b[k + 1]!);
    const sp = Math.min(0.1, Math.max(0.05, size * 0.22));
    const z = b[k + 5]! + 0.0015;
    const grid = (n: number): Vec2 => ({ x: s.pivot.x + ((n % 3) - 1) * sp, y: s.pivot.y + (1 - Math.floor(n / 3)) * sp });
    const pos: number[] = [];
    for (const [a, c] of mark.strokes) {
      const p = grid(a);
      const q = grid(c);
      let dx = q.x - p.x;
      let dy = q.y - p.y;
      const len = Math.hypot(dx, dy);
      // A stroke from a point to itself is a drilled dot.
      if (len < 1e-6) {
        dx = 1;
        dy = 0;
      } else {
        dx /= len;
        dy /= len;
      }
      const e = GROOVE / 2;
      const nx = -dy * e;
      const ny = dx * e;
      const a0 = { x: p.x - dx * e, y: p.y - dy * e };
      const a1 = { x: q.x + dx * e, y: q.y + dy * e };
      pos.push(a0.x - nx, a0.y - ny, z, a1.x - nx, a1.y - ny, z, a1.x + nx, a1.y + ny, z);
      pos.push(a0.x - nx, a0.y - ny, z, a1.x + nx, a1.y + ny, z, a0.x + nx, a0.y + ny, z);
    }
    const n = pos.length / 3;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(n * 3).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
    g.setAttribute('aStone', new BufferAttribute(new Float32Array(n).fill(stone), 1));
    // Shaded as the deepest part of a joint: a cut into the stone, not paint on it.
    g.setAttribute('aJoint', new BufferAttribute(new Float32Array(n).fill(1), 1));
    g.setDrawRange(0, 0);
    this.quads = mark.strokes.length;
    this.material = stoneMaterial(model.uniforms, 'mark', 0xffffff);
    // The same tint object as the stone, so the mark follows it when the textures arrive.
    this.material.color = model.materials[0]!.color;
    this.mesh = new Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'kemer-mark';
    this.at = { x: s.pivot.x, y: s.pivot.y, z };
  }

  /** Show the first `fraction` of the strokes. */
  reveal(fraction: number): void {
    const n = Math.round(Math.min(1, Math.max(0, fraction)) * this.quads);
    this.mesh.geometry.setDrawRange(0, n * 6);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
