/**
 * Open hinges drawn as cracks on both faces: down the joint through the ring, and on from its
 * open side in a stepped line through the wall's joints, as masonry cracks run. The lines share
 * the transform of the ring stone at the joint and are shaded as deep joints, like the mark.
 */
import { BufferAttribute, BufferGeometry, Mesh, type MeshStandardMaterial } from 'three';
import type { Hinge, Vec2 } from '../../core/types';
import { mulberry32 } from '../../core/rng';
import { faceStone } from './mark';
import { stoneMaterial } from './materials';
import type { BridgeModel } from './model';

export interface OpenHinge {
  readonly span: number;
  readonly hinge: Hinge;
}

export class Cracks {
  readonly mesh: Mesh;
  private readonly material: MeshStandardMaterial;

  constructor(private readonly model: BridgeModel) {
    this.material = stoneMaterial(model.uniforms, 'mark', 0xffffff);
    this.material.color = model.materials[0]!.color;
    this.mesh = new Mesh(new BufferGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'kemer-cracks';
    this.mesh.visible = false;
  }

  /** Rebuild the lines for every open hinge. */
  set(hinges: readonly OpenHinge[]): void {
    const m = this.model;
    const pos: number[] = [];
    const nrm: number[] = [];
    const stone: number[] = [];
    for (const { span, hinge } of hinges) {
      const geo = m.geometry.spans[span];
      const joint = geo?.joints[hinge.joint];
      if (!geo || !joint) continue;
      const rng = mulberry32((span * 131 + hinge.joint * 7 + (hinge.side === 'intrados' ? 1 : 2)) >>> 0);
      const { points: path, open } = crackPath(joint.a, joint.b, hinge.side, rng);
      // The stone on the closing side of the joint carries the line.
      const v = Math.min(geo.voussoirs.length - 1, hinge.joint);
      for (const face of [1, -1]) {
        const id = face > 0 ? faceStone(m, { span, stone: v }) : backStone(m, span, v);
        if (id < 0) continue;
        const b = m.field.boxes;
        const z = face > 0 ? b[id * 6 + 5]! + 0.002 : b[id * 6 + 2]! - 0.002;
        // Widest where the joint gapes, thinning as the crack runs out.
        const width = (k: number): number => 0.008 + 0.026 * Math.max(0, 1 - Math.abs(k - open) / path.length);
        for (let k = 0; k < path.length - 1; k++) {
          quad(pos, path[k]!, path[k + 1]!, width(k), width(k + 1), z, face);
          for (let n = 0; n < 6; n++) {
            nrm.push(0, 0, face);
            stone.push(id);
          }
        }
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
    g.setAttribute('aStone', new BufferAttribute(new Float32Array(stone), 1));
    g.setAttribute('aJoint', new BufferAttribute(new Float32Array(stone.length).fill(1), 1));
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
    this.mesh.visible = stone.length > 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/** The downstream piece of a ring course. */
function backStone(model: BridgeModel, span: number, v: number): number {
  let best = -1;
  model.stones.forEach((s, i) => {
    if (!model.isRing(i) || s.span !== span || s.voussoir !== v) return;
    if (best < 0 || s.pivot.z < model.stones[best]!.pivot.z) best = i;
  });
  return best;
}

/**
 * Down the joint from its open end, then (for a joint open at the back) up through the wall in
 * steps of a course and half a block, wandering a little.
 */
export function crackPath(a: Vec2, b: Vec2, side: Hinge['side'], rng: () => number): { points: Vec2[]; open: number } {
  // The open end is opposite the hinge: an intrados hinge opens at the extrados, and the reverse.
  const open = side === 'intrados' ? b : a;
  const shut = side === 'intrados' ? a : b;
  const inner = { x: open.x + (shut.x - open.x) * 0.85, y: open.y + (shut.y - open.y) * 0.85 };
  if (side !== 'intrados') return { points: [open, inner], open: 0 };
  const up: Vec2[] = [];
  let p = open;
  for (let k = 0; k < 4; k++) {
    p = { x: p.x, y: p.y + 0.28 + rng() * 0.08 };
    up.push(p);
    if (k < 3) {
      p = { x: p.x + (rng() < 0.5 ? -1 : 1) * (0.2 + rng() * 0.15), y: p.y };
      up.push(p);
    }
  }
  const points = [...up.reverse(), open, inner];
  return { points, open: up.length };
}

function quad(pos: number[], p: Vec2, q: Vec2, w0: number, w1: number, z: number, face: number): void {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const a = [p.x - nx * w0, p.y - ny * w0];
  const b = [q.x - nx * w1, q.y - ny * w1];
  const c = [q.x + nx * w1, q.y + ny * w1];
  const d = [p.x + nx * w0, p.y + ny * w0];
  const tri = (u: number[], v: number[], w: number[]): void => {
    pos.push(u[0]!, u[1]!, z, v[0]!, v[1]!, z, w[0]!, w[1]!, z);
  };
  if (face > 0) {
    tri(a, b, c);
    tri(a, c, d);
  } else {
    tri(a, c, b);
    tri(a, d, c);
  }
}
