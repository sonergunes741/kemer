/**
 * The river: a strip that follows the meandering channel from far upstream to far downstream,
 * a baked heightmap of the bed (so the shader knows the depth at every pixel), and a foam field
 * around the piers baked when the bridge changes. Uniforms are driven from WaterState.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  DataTexture,
  DataUtils,
  FloatType,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RedFormat,
  RGBAFormat,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  UnsignedByteType,
  Vector3,
  Vector4,
  ClampToEdgeWrapping,
  NearestFilter,
  type Texture,
} from 'three';
import type { WaterState } from '../../core/contracts';
import type { BridgeGeometry } from '../../core/types';
import { clamp } from '../../core/math';
import { MAX_SLIDE, MAX_WIDEN, type TerrainField } from './ground';
import { gridLines } from './terrain';
import { MAX_RIPPLES, WATER_FRAGMENT, WATER_VERTEX } from './waterShader';

const BED_U = 192;
const BED_Z = 640;
const Z0 = 30;
const MAX_PIERS = 256;

export class River {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  private readonly geometry: BufferGeometry;
  private readonly bed: DataTexture;
  private foam: DataTexture | null = null;
  private readonly scour: DataTexture;
  private readonly scourData = new Float32Array(MAX_PIERS);
  private readonly ripples: Vector4[] = [];
  private nextRipple = 0;
  private time = 0;
  private baked: BridgeGeometry | null | undefined = undefined;
  readonly state: WaterState = { level: 0, speed: 0.8, turbidity: 0.1, rough: 0.1, heap: 0 };

  constructor(
    private readonly field: TerrainField,
    waves: Texture,
    maxLevel: number,
    private readonly halfWidth: number,
  ) {
    const [bl, br] = field.banks(maxLevel);
    const margin = 4 + field.riverWidth * 0.15;
    // Away from the bridge the banks swing and slide outwards: the strip must still reach them.
    const slide = field.riverWidth * MAX_SLIDE;
    const u0 = field.channelX + (bl - field.channelX) * MAX_WIDEN - slide - margin;
    const u1 = field.channelX + (br - field.channelX) * MAX_WIDEN + slide + margin;
    const zExtent = Math.min(field.extent * 0.9, 3200);

    // Bed heightmap in channel space: u across (x minus the meander shift), z stretched so the
    // texels are dense near the bridge and sparse far away.
    const A = Math.asinh(zExtent / Z0);
    const data = new Uint16Array(BED_U * BED_Z);
    for (let j = 0; j < BED_Z; j++) {
      const t = (j + 0.5) / BED_Z;
      const z = Z0 * Math.sinh((2 * t - 1) * A);
      const shift = field.shift(z);
      for (let i = 0; i < BED_U; i++) {
        const u = u0 + ((i + 0.5) / BED_U) * (u1 - u0);
        data[j * BED_U + i] = DataUtils.toHalfFloat(field.height(u + shift, z));
      }
    }
    this.bed = new DataTexture(data, BED_U, BED_Z, RedFormat, HalfFloatType);
    this.bed.magFilter = LinearFilter;
    this.bed.minFilter = LinearFilter;
    this.bed.wrapS = this.bed.wrapT = ClampToEdgeWrapping;
    this.bed.needsUpdate = true;

    this.scour = new DataTexture(this.scourData, MAX_PIERS, 1, RedFormat, FloatType);
    this.scour.magFilter = this.scour.minFilter = NearestFilter;
    this.scour.needsUpdate = true;

    // The strip itself.
    const across = clamp(Math.round((u1 - u0) / Math.max(0.4, field.riverWidth / 26)), 24, 90);
    const zs = gridLines(-field.exactHalf, field.exactHalf, clamp(field.riverWidth / 30, 0.25, 1.2), 1.07, zExtent, []);
    const nz = zs.length;
    const nu = across + 1;
    const pos = new Float32Array(nu * nz * 3);
    const aU = new Float32Array(nu * nz);
    const aBase = new Float32Array(nu * nz);
    const aFlow = new Float32Array(nu * nz * 2);
    for (let j = 0; j < nz; j++) {
      const z = zs[j]!;
      const shift = field.shift(z);
      const ds = field.shiftSlope(z);
      const len = Math.hypot(ds, 1);
      for (let i = 0; i < nu; i++) {
        const u = u0 + (i / across) * (u1 - u0);
        const k = j * nu + i;
        pos[k * 3] = u + shift;
        pos[k * 3 + 1] = 0;
        pos[k * 3 + 2] = z;
        aU[k] = u;
        aBase[k] = field.fall(z);
        // Downstream is -Z, bending with the channel.
        aFlow[k * 2] = -ds / len;
        aFlow[k * 2 + 1] = -1 / len;
      }
    }
    const index = new Uint32Array(across * (nz - 1) * 6);
    let q = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < across; i++) {
        const a = j * nu + i;
        const b = a + 1;
        const c = a + nu;
        const d = c + 1;
        index[q++] = a;
        index[q++] = c;
        index[q++] = b;
        index[q++] = b;
        index[q++] = c;
        index[q++] = d;
      }
    }
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(pos, 3));
    this.geometry.setAttribute('aU', new BufferAttribute(aU, 1));
    this.geometry.setAttribute('aBase', new BufferAttribute(aBase, 1));
    this.geometry.setAttribute('aFlow', new BufferAttribute(aFlow, 2));
    this.geometry.setIndex(new BufferAttribute(index, 1));
    this.geometry.computeBoundingSphere();
    // The surface moves up and down; give culling room for a flood.
    if (this.geometry.boundingSphere) this.geometry.boundingSphere.radius += maxLevel + 10;

    for (let i = 0; i < MAX_RIPPLES; i++) this.ripples.push(new Vector4(0, 0, -100, 0));

    const uniforms = UniformsUtils.merge([UniformsLib.lights, UniformsLib.fog]);
    Object.assign(uniforms, {
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uHeap: { value: 0 },
      uHalfW: { value: halfWidth },
      uHeapLen: { value: clamp(field.riverWidth * 6, 60, 600) },
      uSpeed: { value: 0.8 },
      uTurb: { value: 0.1 },
      uRough: { value: 0.1 },
      uWaves: { value: waves },
      uDeep: { value: new Color() },
      uShallow: { value: new Color() },
      uSilt: { value: new Color() },
      uAbsorb: { value: 0.6 },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uSunLight: { value: new Color() },
      uBodyLight: { value: new Color(1, 1, 1) },
      uZenith: { value: new Color() },
      uHorizon: { value: new Color() },
      uReflection: { value: null },
      uReflOn: { value: 0 },
      uTexMatrix: { value: new Matrix4() },
      uBed: { value: this.bed },
      uBedXf: { value: new Vector4(u0, 1 / (u1 - u0), Z0, 1 / A) },
      uFoamTex: { value: null },
      uFoamXf: { value: new Vector4(0, 1, 0, 1) },
      uFoamOn: { value: 0 },
      uScour: { value: this.scour },
      uRipples: { value: this.ripples },
      uDaylight: { value: 1 },
    });
    this.material = new ShaderMaterial({
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
      uniforms,
      lights: true,
      fog: true,
      transparent: true,
      depthWrite: true,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
    this.material.name = 'river';
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = 'river';
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 10;
  }

  get uniforms(): ShaderMaterial['uniforms'] {
    return this.material.uniforms;
  }

  setColors(deep: number, shallow: number, silt: number, absorb: number): void {
    const u = this.uniforms;
    (u['uDeep']!.value as Color).set(deep);
    (u['uShallow']!.value as Color).set(shallow);
    (u['uSilt']!.value as Color).set(silt);
    u['uAbsorb']!.value = absorb;
  }

  setState(s: WaterState): void {
    Object.assign(this.state, s);
  }

  /** Surface height at a world point (for floating things and splashes). */
  surfaceAt(z: number): number {
    const s = this.state;
    const hw = this.halfWidth;
    const t = clamp((z + hw) / (2 * hw + 2), 0, 1);
    const up = t * t * (3 - 2 * t) * Math.exp(-Math.max(z - hw - 2, 0) / (this.uniforms['uHeapLen']!.value as number));
    return s.level + this.field.fall(z) + s.heap * up;
  }

  ripple(x: number, z: number, size: number): void {
    const r = this.ripples[this.nextRipple]!;
    r.set(x, z, this.time, clamp(size, 0.2, 4));
    this.nextRipple = (this.nextRipple + 1) % MAX_RIPPLES;
  }

  update(dt: number): void {
    this.time += dt;
    const u = this.uniforms;
    const s = this.state;
    u['uTime']!.value = this.time;
    u['uLevel']!.value = s.level;
    u['uHeap']!.value = s.heap;
    u['uSpeed']!.value = s.speed;
    u['uTurb']!.value = clamp(s.turbidity, 0, 1);
    u['uRough']!.value = clamp(s.rough, 0, 1);
  }

  /** Bake the foam around the piers and keep each pier's scour depth. */
  setBridge(geometry: BridgeGeometry | null, scour?: readonly number[]): void {
    const u = this.uniforms;
    for (let i = 0; i < MAX_PIERS; i++) this.scourData[i] = scour?.[i] ?? 0;
    this.scour.needsUpdate = true;
    // Scour changes every frame of the time-lapse; the foam bake only when the bridge does.
    if (geometry === this.baked) return;
    this.baked = geometry;
    if (!geometry || geometry.piers.length === 0) {
      u['uFoamOn']!.value = 0;
      return;
    }
    const hw = geometry.width / 2;
    let x0 = Infinity;
    let x1 = -Infinity;
    let wMax = 1;
    for (const p of geometry.piers) {
      x0 = Math.min(x0, p.x - p.width);
      x1 = Math.max(x1, p.x + p.width);
      wMax = Math.max(wMax, p.width);
    }
    x0 -= 6;
    x1 += 6;
    const zDown = -hw - clamp(6 * wMax + 14, 16, 70);
    const zUp = hw + clamp(2 * wMax + 4, 5, 20);
    const nx = clamp(Math.round((x1 - x0) * 4), 64, 2048);
    const nz = clamp(Math.round((zUp - zDown) * 4), 64, 512);
    const data = new Uint8Array(nx * nz * 4);
    const piers = geometry.piers;
    for (let j = 0; j < nz; j++) {
      const z = zDown + ((j + 0.5) / nz) * (zUp - zDown);
      for (let i = 0; i < nx; i++) {
        const x = x0 + ((i + 0.5) / nx) * (x1 - x0);
        let foam = 0;
        let near = 0;
        let which = 0;
        let best = Infinity;
        for (let k = 0; k < piers.length; k++) {
          const p = piers[k]!;
          const half = p.width / 2;
          const ax = Math.abs(x - p.x);
          if (ax > half + 60) continue;
          // Cutwaters push the footprint upstream into a point.
          const nose = p.cutwater ? Math.max(0, half - ax) : 0;
          const dx = Math.max(ax - half, 0);
          const up = Math.max(z - hw - nose, 0);
          const dn = Math.max(-hw - z, 0);
          const d = Math.hypot(dx, up, dn);
          if (d < best) {
            best = d;
            which = k;
          }
          let f = Math.exp(-d / 0.35);
          if (z > hw) f = Math.max(f, Math.exp(-d / (0.6 + half * 0.4)) * 0.75);
          if (dn > 0) {
            const spread = half + dn * 0.16;
            const inside = 1 - smoothstepJs(spread * 0.55, spread, ax);
            const decay = Math.exp(-dn / (5 + 3 * p.width));
            const shear = Math.exp(-Math.pow((ax - spread) / 0.5, 2)) * Math.exp(-dn / (10 + 4 * p.width));
            f = Math.max(f, inside * decay * 0.85, shear * 0.7);
          }
          foam = Math.max(foam, f);
          near = Math.max(near, Math.exp(-d / (1 + p.width * 0.6)));
        }
        const o = (j * nx + i) * 4;
        data[o] = Math.round(clamp(foam, 0, 1) * 255);
        data[o + 1] = Math.round(near * 255);
        data[o + 2] = Math.min(which, 255);
        data[o + 3] = 255;
      }
    }
    this.foam?.dispose();
    this.foam = new DataTexture(data, nx, nz, RGBAFormat, UnsignedByteType);
    this.foam.magFilter = LinearFilter;
    this.foam.minFilter = LinearFilter;
    this.foam.needsUpdate = true;
    u['uFoamTex']!.value = this.foam;
    (u['uFoamXf']!.value as Vector4).set(x0, 1 / (x1 - x0), zDown, 1 / (zUp - zDown));
    u['uFoamOn']!.value = 1;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.bed.dispose();
    this.scour.dispose();
    this.foam?.dispose();
  }
}

function smoothstepJs(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
