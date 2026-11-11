/**
 * Short-lived particles in one draw call: stone dust (ring, puff, fall, trail), splash droplets
 * and spray, chips of wood, stone and leaf. Simulated on the CPU (a few hundred at most) and
 * drawn as soft or hard-edged points lit by the scene's light level.
 */
import { BufferAttribute, BufferGeometry, Color, NormalBlending, Points, ShaderMaterial, Vector3 } from 'three';
import type { DustKind } from '../../core/contracts';
import type { Vec3 } from '../../core/types';
import { clamp } from '../../core/math';

const enum Kind {
  Dust = 0,
  Drop = 1,
  Chip = 2,
  Spray = 3,
}

const VERTEX = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
attribute float aSoft;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
varying float vSoft;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 0.0, 256.0);
  vAlpha = aAlpha;
  vColor = aColor;
  vSoft = aSoft;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uLight;
varying float vAlpha;
varying vec3 vColor;
varying float vSoft;
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r = dot(d, d);
  if (vSoft < 0.5 && r > 0.6) discard;
  float a = vSoft > 0.5 ? exp(-r * 3.0) * smoothstep(1.0, 0.7, r) : 1.0;
  gl_FragColor = vec4(vColor * uLight, a * vAlpha);
}
`;

export class Particles {
  readonly points: Points;
  private readonly cap: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size0: Float32Array;
  private readonly size1: Float32Array;
  private readonly alpha0: Float32Array;
  private readonly kind: Uint8Array;
  private readonly aSize: Float32Array;
  private readonly aAlpha: Float32Array;
  private readonly aColor: Float32Array;
  private readonly aSoft: Float32Array;
  private readonly geometry: BufferGeometry;
  private readonly material: ShaderMaterial;
  private next = 0;
  /** Multiplier from the quality preset. */
  budget = 1;
  readonly light = new Color(1, 1, 1);
  private readonly dustColor = new Color(0.78, 0.74, 0.66);
  private readonly tmp = new Vector3();

  constructor(
    capacity: number,
    private readonly ground: (x: number, z: number) => number,
    private readonly water: (z: number) => number,
  ) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    this.alpha0 = new Float32Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.aSize = new Float32Array(capacity);
    this.aAlpha = new Float32Array(capacity);
    this.aColor = new Float32Array(capacity * 3);
    this.aSoft = new Float32Array(capacity);
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('aSize', new BufferAttribute(this.aSize, 1));
    this.geometry.setAttribute('aAlpha', new BufferAttribute(this.aAlpha, 1));
    this.geometry.setAttribute('aColor', new BufferAttribute(this.aColor, 3));
    this.geometry.setAttribute('aSoft', new BufferAttribute(this.aSoft, 1));
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uScale: { value: 600 }, uLight: { value: this.light } },
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    });
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.points.name = 'particles';
  }

  setDustColor(c: Color): void {
    this.dustColor.copy(c);
  }

  /** Pixels per metre at one metre: viewport height / (2 tan(fov/2)). */
  setScale(pixelsPerMetre: number): void {
    this.material.uniforms['uScale']!.value = pixelsPerMetre;
  }

  private spawn(kind: Kind, at: Vec3, v: Vector3, life: number, s0: number, s1: number, alpha: number, color: Color, soft: boolean): void {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    this.pos[i * 3] = at.x;
    this.pos[i * 3 + 1] = at.y;
    this.pos[i * 3 + 2] = at.z;
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size0[i] = s0;
    this.size1[i] = s1;
    this.alpha0[i] = alpha;
    this.kind[i] = kind;
    this.aColor[i * 3] = color.r;
    this.aColor[i * 3 + 1] = color.g;
    this.aColor[i * 3 + 2] = color.b;
    this.aSoft[i] = soft ? 1 : 0;
  }

  private count(n: number): number {
    return Math.max(1, Math.round(n * this.budget));
  }

  dust(kind: DustKind, at: Vec3, size: number): void {
    const s = clamp(size, 0.1, 8);
    const v = this.tmp;
    const c = this.dustColor;
    const p = { x: at.x, y: at.y, z: at.z };
    if (kind === 'ring') {
      const n = this.count(40 + s * 20);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
        const sp = (2.2 + Math.random() * 1.6) * Math.sqrt(s);
        v.set(Math.cos(a) * sp, 0.15 + Math.random() * 0.35, Math.sin(a) * sp);
        p.x = at.x + Math.cos(a) * 0.2 * s;
        p.z = at.z + Math.sin(a) * 0.2 * s;
        this.spawn(Kind.Dust, p, v, 1.6 + Math.random() * 1.2, 0.35 * s, 1.4 * s, 0.38, c, true);
      }
    } else if (kind === 'puff') {
      const n = this.count(8 + s * 10);
      for (let i = 0; i < n; i++) {
        v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).multiplyScalar(1.4 * Math.sqrt(s));
        this.spawn(Kind.Dust, at, v, 1.1 + Math.random() * 1.1, 0.25 * s, 0.9 * s, 0.32, c, true);
      }
    } else if (kind === 'fall') {
      const n = this.count(10 + s * 8);
      for (let i = 0; i < n; i++) {
        p.x = at.x + (Math.random() - 0.5) * s;
        p.y = at.y + (Math.random() - 0.5) * 0.3 * s;
        p.z = at.z + (Math.random() - 0.5) * s;
        v.set((Math.random() - 0.5) * 0.2, -0.3 - Math.random() * 0.5, (Math.random() - 0.5) * 0.2);
        this.spawn(Kind.Dust, p, v, 2 + Math.random() * 1.5, 0.12 * s, 0.5 * s, 0.26, c, true);
      }
    } else {
      const n = this.count(3 + s * 2);
      for (let i = 0; i < n; i++) {
        v.set((Math.random() - 0.5) * 0.3, 0.1 + Math.random() * 0.2, (Math.random() - 0.5) * 0.3);
        this.spawn(Kind.Dust, at, v, 0.8 + Math.random() * 0.6, 0.15 * s, 0.6 * s, 0.22, c, true);
      }
    }
  }

  splash(at: Vec3, size: number, foam: Color): void {
    const s = clamp(size, 0.1, 6);
    const v = this.tmp;
    // A crown of drops thrown up and out, and a thin veil of spray that rises as a column: a
    // round cloud of spray at the water reads as a puff of smoke.
    const n = this.count(20 + s * 30);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const out = (0.5 + Math.random() * 1.4) * Math.sqrt(s);
      v.set(Math.cos(a) * out, (2.4 + Math.random() * 3.4) * Math.sqrt(s), Math.sin(a) * out);
      this.spawn(Kind.Drop, at, v, 1.4, 0.06 + 0.035 * s, 0.04, 0.9, foam, true);
    }
    const m = this.count(4 + s * 4);
    for (let i = 0; i < m; i++) {
      v.set((Math.random() - 0.5) * 0.9, 1.4 + Math.random() * 1.8, (Math.random() - 0.5) * 0.9).multiplyScalar(Math.sqrt(s));
      this.spawn(Kind.Spray, at, v, 0.9 + Math.random() * 0.7, 0.25 * s, 1.0 * s, 0.16, foam, true);
    }
  }

  chips(at: Vec3, count: number, color: Color): void {
    const v = this.tmp;
    const n = this.count(clamp(count, 1, 120));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 2.5;
      v.set(Math.cos(a) * sp, 1.5 + Math.random() * 3, Math.sin(a) * sp);
      const shade = 0.75 + Math.random() * 0.5;
      this.spawn(Kind.Chip, at, v, 2.5 + Math.random(), 0.035 + Math.random() * 0.03, 0.035, 1, color.clone().multiplyScalar(shade), false);
    }
  }

  update(dt: number): void {
    const g = 9.81;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i]! <= 0) {
        this.aAlpha[i] = 0;
        continue;
      }
      const k = this.kind[i]!;
      let vx = this.vel[i * 3]!;
      let vy = this.vel[i * 3 + 1]!;
      let vz = this.vel[i * 3 + 2]!;
      const drag = k === Kind.Dust ? 1.8 : k === Kind.Spray ? 1.4 : 0.25;
      const fall = k === Kind.Dust ? 0.05 : k === Kind.Spray ? 0.6 : g;
      const decay = Math.exp(-drag * dt);
      vx *= decay;
      vz *= decay;
      vy = vy * decay - fall * dt;
      let x = this.pos[i * 3]! + vx * dt;
      let y = this.pos[i * 3 + 1]! + vy * dt;
      const z = this.pos[i * 3 + 2]! + vz * dt;
      if (k === Kind.Drop && vy < 0 && y < this.water(z)) this.life[i] = 0;
      if (k === Kind.Chip) {
        const ground = Math.max(this.ground(x, z), this.water(z));
        if (y < ground) {
          y = ground + 0.01;
          vx = vy = vz = 0;
          x = this.pos[i * 3]!;
        }
      }
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = vx;
      this.vel[i * 3 + 1] = vy;
      this.vel[i * 3 + 2] = vz;
      this.life[i] = this.life[i]! - dt;
      const t = 1 - Math.max(0, this.life[i]!) / this.maxLife[i]!;
      this.aSize[i] = this.size0[i]! + (this.size1[i]! - this.size0[i]!) * Math.sqrt(t);
      const fadeIn = Math.min(1, t * 8);
      const fadeOut = 1 - t * t;
      this.aAlpha[i] = this.alpha0[i]! * fadeIn * fadeOut;
    }
    for (const name of ['position', 'aSize', 'aAlpha', 'aColor', 'aSoft']) {
      (this.geometry.getAttribute(name) as BufferAttribute).needsUpdate = true;
    }
  }

  clear(): void {
    this.life.fill(0);
    this.aAlpha.fill(0);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
