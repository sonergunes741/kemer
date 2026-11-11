/**
 * The design-mode draft: a light massing model in pale chalk (ring bands, spandrel faces, piers,
 * deck and parapets) rebuilt into the same buffers on every pointer move. No stones, no joints:
 * the interface draws the joints over it.
 */
import { BufferAttribute, BufferGeometry, DoubleSide, LessEqualDepth, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import type { BridgeGeometry, LevelDef, Vec2 } from '../../core/types';
import { BridgeFrame, PAVE, type Interval } from './frame';
import { pierPlan } from './layoutPier';
import { PARAPET_T } from './layoutWall';

const CHALK = 0xf3efe6;
/** How much of the valley the chalk hides where it faces the eye. */
const OPACITY = 0.5;
const STEP = 0.25;

class Builder {
  pos = new Float32Array(3 * 30000);
  n = 0;

  private grow(extra: number): void {
    if ((this.n + extra) * 3 <= this.pos.length) return;
    const next = new Float32Array(Math.max(this.pos.length * 2, (this.n + extra) * 3));
    next.set(this.pos);
    this.pos = next;
  }

  tri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): void {
    this.grow(3);
    const p = this.pos;
    let k = this.n * 3;
    p[k++] = ax;
    p[k++] = ay;
    p[k++] = az;
    p[k++] = bx;
    p[k++] = by;
    p[k++] = bz;
    p[k++] = cx;
    p[k++] = cy;
    p[k] = cz;
    this.n += 3;
  }

  /** Quad a-b-c-d, counter-clockwise seen from the front. */
  quad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]): void {
    this.tri(a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!, c[0]!, c[1]!, c[2]!);
    this.tri(a[0]!, a[1]!, a[2]!, c[0]!, c[1]!, c[2]!, d[0]!, d[1]!, d[2]!);
  }

  /** A strip between two x-ordered edges in a face plane z, facing +z (front) or -z. */
  panel(xs: readonly number[], lo: readonly number[], hi: readonly number[], z: number, front: boolean): void {
    for (let i = 0; i < xs.length - 1; i++) {
      const a = [xs[i]!, lo[i]!, z];
      const b = [xs[i + 1]!, lo[i + 1]!, z];
      const c = [xs[i + 1]!, hi[i + 1]!, z];
      const d = [xs[i]!, hi[i]!, z];
      if (front) this.quad(a, b, c, d);
      else this.quad(b, a, d, c);
    }
  }
}

export class Draft {
  readonly mesh: Mesh;
  private readonly geometry = new BufferGeometry();
  private readonly b = new Builder();
  private readonly material: MeshStandardMaterial;
  private readonly prepass: MeshBasicMaterial;

  constructor() {
    // A proposal, not stone: pale chalk the valley shows through, flat-shaded so every face
    // meets the next along a crisp edge. Double-sided: a massing model rebuilt every pointer move
    // need not get every winding right.
    this.material = new MeshStandardMaterial({
      color: CHALK,
      roughness: 0.92,
      metalness: 0,
      flatShading: true,
      side: DoubleSide,
      // A little light of its own: chalk stays pale on the shaded side too.
      emissive: CHALK,
      emissiveIntensity: 0.18,
      transparent: true,
      opacity: OPACITY,
      depthWrite: false,
      depthFunc: LessEqualDepth,
    });
    // Faces seen edge-on thicken, as a sheet of frosted glass does: the outline stays drawn
    // while the faces turned to the eye stay light.
    this.material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);
        gl_FragColor.a = min(1.0, gl_FragColor.a + rim * 0.35);`,
      );
    };
    this.material.customProgramCacheKey = () => 'kemer-draft';
    this.geometry.setAttribute('position', new BufferAttribute(this.b.pos, 3));
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'kemer-draft';
    this.mesh.visible = false;
    // Only the nearest surface is drawn: a depth-only pass of the same geometry goes first, so
    // the faces behind do not pile up into an opaque block. Both sit after the river in the
    // transparent queue, so the water still shows through.
    this.prepass = new MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: DoubleSide, transparent: true });
    const depth = new Mesh(this.geometry, this.prepass);
    depth.name = 'kemer-draft-depth';
    depth.renderOrder = 998;
    depth.frustumCulled = false;
    this.mesh.renderOrder = 999;
    this.mesh.add(depth);
  }

  show(level: LevelDef, g: BridgeGeometry): void {
    const b = this.b;
    b.n = 0;
    const h = g.width / 2;
    const frame = new BridgeFrame(g, level.site.ground, g.piers, g.spans.map((geo, index) => ({ geo, index, arcade: false })), g.deck, g.reliefs);
    this.rings(g, h);
    this.faces(frame, h);
    this.deck(g, h);
    for (const p of g.piers) this.pier(pierPlan(p, h), Math.max(p.base, p.bed - 0.6), p.top);
    if (b.pos !== (this.geometry.getAttribute('position').array as Float32Array)) {
      this.geometry.setAttribute('position', new BufferAttribute(b.pos, 3));
    }
    const attr = this.geometry.getAttribute('position') as BufferAttribute;
    attr.needsUpdate = true;
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, b.n * 3);
    this.geometry.setDrawRange(0, b.n);
    this.geometry.deleteAttribute('normal');
    this.geometry.computeBoundingSphere();
    this.mesh.visible = b.n > 0;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  private rings(g: BridgeGeometry, h: number): void {
    const b = this.b;
    for (const s of g.spans) {
      const inn = resample(s.intrados, 48);
      const out = resample(s.extrados, 48);
      for (let i = 0; i < inn.length - 1; i++) {
        const a = inn[i]!;
        const c = inn[i + 1]!;
        const d = out[i]!;
        const e = out[i + 1]!;
        // Faces of the ring band on both sides.
        b.quad([a.x, a.y, h], [c.x, c.y, h], [e.x, e.y, h], [d.x, d.y, h]);
        b.quad([c.x, c.y, -h], [a.x, a.y, -h], [d.x, d.y, -h], [e.x, e.y, -h]);
        // The soffit, seen from below.
        b.quad([a.x, a.y, -h], [c.x, c.y, -h], [c.x, c.y, h], [a.x, a.y, h]);
      }
    }
  }

  private faces(frame: BridgeFrame, h: number): void {
    const n = Math.max(2, Math.ceil((frame.x1 - frame.x0) / STEP));
    let runs: { xs: number[]; lo: number[]; hi: number[] }[] = [];
    const solid = (x: number): Interval[] => frame.solidAt(x).filter((p) => p[1] - p[0] > 0.01);
    const add = (x: number, parts: readonly Interval[]): void => {
      parts.forEach((p, j) => {
        const r = runs[j];
        if (!r) return;
        r.xs.push(x);
        r.lo.push(p[0]);
        // The face carries on up into the parapet.
        r.hi.push(Math.abs(p[1] - frame.wallTop(x)) < 1e-6 ? p[1] + PAVE : p[1]);
      });
    };
    const flush = (): void => {
      for (const r of runs) {
        if (r.xs.length < 2) continue;
        this.b.panel(r.xs, r.lo, r.hi, h - 0.002, true);
        this.b.panel(r.xs, r.lo, r.hi, -h + 0.002, false);
      }
      runs = [];
    };
    let prevX = frame.x0;
    for (let i = 0; i <= n; i++) {
      const x = frame.x0 + ((frame.x1 - frame.x0) * i) / n;
      const parts = solid(x);
      if (parts.length !== runs.length) {
        if (i > 0) {
          // Find where the wall changes shape (a ring or a pier begins) so no sliver is left open.
          let a = prevX;
          let b = x;
          const count = runs.length;
          for (let k = 0; k < 12; k++) {
            const m = (a + b) / 2;
            if (solid(m).length === count) a = m;
            else b = m;
          }
          add(a, solid(a));
          flush();
          runs = parts.map(() => ({ xs: [], lo: [], hi: [] }));
          const start = solid(b);
          if (start.length === runs.length) add(b, start);
        } else {
          runs = parts.map(() => ({ xs: [], lo: [], hi: [] }));
        }
      }
      add(x, parts);
      prevX = x;
    }
    flush();
  }

  private deck(g: BridgeGeometry, h: number): void {
    const b = this.b;
    const ph = g.parapetHeight;
    const pts: readonly Vec2[] = g.deck;
    const it = h - PARAPET_T;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i]!;
      const q = pts[i + 1]!;
      // Road between the parapets, then each parapet: outer face, top, inner face.
      b.quad([p.x, p.y, it], [q.x, q.y, it], [q.x, q.y, -it], [p.x, p.y, -it]);
      for (const s of [1, -1]) {
        const zo = s * h;
        const zi = s * it;
        const top = (v: Vec2): number => v.y + ph;
        const outer = [
          [p.x, p.y, zo],
          [q.x, q.y, zo],
          [q.x, top(q), zo],
          [p.x, top(p), zo],
        ] as const;
        const inner = [
          [q.x, q.y, zi],
          [p.x, p.y, zi],
          [p.x, top(p), zi],
          [q.x, top(q), zi],
        ] as const;
        const lid = [
          [p.x, top(p), zi],
          [p.x, top(p), zo],
          [q.x, top(q), zo],
          [q.x, top(q), zi],
        ] as const;
        if (s > 0) {
          b.quad(...outer);
          b.quad(...inner);
          b.quad(...lid);
        } else {
          b.quad(outer[1], outer[0], outer[3], outer[2]);
          b.quad(inner[1], inner[0], inner[3], inner[2]);
          b.quad(lid[3], lid[2], lid[1], lid[0]);
        }
      }
    }
  }

  private pier(plan: readonly Vec2[], y0: number, y1: number): void {
    const b = this.b;
    const n = plan.length;
    for (let i = 0; i < n; i++) {
      const p = plan[i]!;
      const q = plan[(i + 1) % n]!;
      // Plan is CCW in (x, z): the outward side is to the right, seen from above.
      b.quad([q.x, y0, q.y], [p.x, y0, p.y], [p.x, y1, p.y], [q.x, y1, q.y]);
    }
    const c = plan.reduce((acc, p) => ({ x: acc.x + p.x / n, y: acc.y + p.y / n }), { x: 0, y: 0 });
    for (let i = 0; i < n; i++) {
      const p = plan[i]!;
      const q = plan[(i + 1) % n]!;
      b.tri(c.x, y1, c.y, q.x, y1, q.y, p.x, y1, p.y);
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.prepass.dispose();
  }
}

/** Resample a polyline to `count` points evenly by arc length. */
function resample(line: readonly Vec2[], count: number): Vec2[] {
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1]! + Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y));
  const total = cum[cum.length - 1]!;
  const out: Vec2[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const s = (total * k) / (count - 1);
    while (j < line.length - 2 && cum[j + 1]! < s) j++;
    const t = (s - cum[j]!) / Math.max(1e-9, cum[j + 1]! - cum[j]!);
    out.push({ x: line[j]!.x + (line[j + 1]!.x - line[j]!.x) * t, y: line[j]!.y + (line[j + 1]!.y - line[j]!.y) * t });
  }
  return out;
}
