/**
 * Timber pieces as instanced boxes (length along local X) with a material whose grain is mapped
 * from each instance's own size, so long planks and short wedges share one texture and one draw.
 */
import { BoxGeometry, type BufferAttribute, BufferGeometry, Color, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { TextureSet } from './textures';

export type TimberKind = 'rib' | 'lag' | 'tie' | 'post' | 'strut' | 'brace' | 'wedge' | 'hoist' | 'rope';

export interface Piece {
  readonly span: number;
  readonly kind: TimberKind;
  readonly pos: Vector3;
  readonly quat: Quaternion;
  readonly size: Vector3;
}

const TIMBER = 0x86725a;

export function timberMaterial(color = TIMBER): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms['uTimber'] = { value: m.userData['map'] ?? null };
    shader.uniforms['uHasTimber'] = { value: m.userData['map'] ? 1 : 0 };
    m.userData['shader'] = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vTimberUv;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 kS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          float kSeed = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);
        #else
          vec3 kS = vec3(1.0);
          float kSeed = 0.0;
        #endif
        vec3 kP = position * kS;
        vec3 kN = abs(normal);
        vec2 kUv = kN.x > 0.5 ? kP.zy : (kN.y > 0.5 ? vec2(kP.z, kP.x) : vec2(kP.y, kP.x));
        // Grain runs along the timber; the tile covers half a metre across and is stretched along it.
        vTimberUv = vec2(kUv.x / 0.5, kUv.y / 1.3) + vec2(kSeed * 7.0, kSeed * 3.0);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vTimberUv;\nuniform sampler2D uTimber;\nuniform float uHasTimber;')
      .replace(
        '#include <map_fragment>',
        `if (uHasTimber > 0.5) diffuseColor.rgb *= texture2D(uTimber, vTimberUv).rgb * 1.15;`,
      );
  };
  m.customProgramCacheKey = () => 'kemer-timber';
  return m;
}

export function setTimberTexture(m: MeshStandardMaterial, set: TextureSet | null): void {
  m.userData['map'] = set?.color ?? null;
  if (set) m.color.setHex(0xffffff);
  const shader = m.userData['shader'] as { uniforms: Record<string, { value: unknown }> } | undefined;
  if (shader) {
    shader.uniforms['uTimber']!.value = set?.color ?? null;
    shader.uniforms['uHasTimber']!.value = set ? 1 : 0;
  }
}

/** A box of the given size centred between two points, its length along a-b, rolled `roll` about it. */
export function between(a: Vector3, b: Vector3, width: number, depth: number, up = new Vector3(0, 0, 1)): { pos: Vector3; quat: Quaternion; size: Vector3 } {
  const dir = b.clone().sub(a);
  const len = dir.length();
  dir.normalize();
  const side = new Vector3().crossVectors(up, dir);
  if (side.lengthSq() < 1e-6) side.set(0, 1, 0).cross(dir);
  side.normalize();
  const upn = new Vector3().crossVectors(dir, side).normalize();
  const m = new Matrix4().makeBasis(dir, side, upn);
  return { pos: a.clone().add(b).multiplyScalar(0.5), quat: new Quaternion().setFromRotationMatrix(m), size: new Vector3(len, width, depth) };
}

/** A triangular wedge, thick end at -X, for the folding wedges under the centering. */
export function wedgeGeometry(): BufferGeometry {
  const g = new BoxGeometry(1, 1, 1);
  const pos = g.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    // Taper the top towards +X so the wedge drives in from the thin end.
    if (pos.getY(i) > 0 && pos.getX(i) > 0) pos.setY(i, -0.3);
  }
  g.computeVertexNormals();
  return g;
}

export class TimberMesh {
  readonly mesh: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly s = new Vector3();

  constructor(
    readonly pieces: readonly Piece[],
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
  ) {
    this.mesh = new InstancedMesh(geometry, material, Math.max(1, pieces.length));
    this.mesh.count = pieces.length;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    const white = new Color(1, 1, 1);
    for (let i = 0; i < pieces.length; i++) this.mesh.setColorAt(i, white);
  }

  /** Place piece i moved by a rigid transform (rotation `q` about `pivot`, then `offset`), scaled by `grow`. */
  place(i: number, offset: Vector3, q: Quaternion | null, pivot: Vector3 | null, grow = 1): void {
    const p = this.pieces[i]!;
    const pos = p.pos.clone();
    const quat = p.quat.clone();
    if (q && pivot) {
      pos.sub(pivot).applyQuaternion(q).add(pivot);
      quat.premultiply(q);
    }
    pos.add(offset);
    this.s.copy(p.size).multiplyScalar(grow);
    this.m.compose(pos, quat, this.s);
    this.mesh.setMatrixAt(i, this.m);
  }

  /** Place piece i at an absolute pose and size (the rope, whose length changes). */
  set(i: number, pos: Vector3, quat: Quaternion, size: Vector3): void {
    this.m.compose(pos, quat, size);
    this.mesh.setMatrixAt(i, this.m);
  }

  hide(i: number): void {
    this.m.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(i, this.m);
  }

  tint(i: number, c: Color): void {
    this.mesh.setColorAt(i, c);
  }

  commit(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}
