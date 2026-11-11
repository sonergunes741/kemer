/**
 * Ambient life: rain and snow around the view, a few birds wheeling over the valley, and
 * driftwood carried down the river in a flood.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
  type Camera,
} from 'three';
import type { BridgeGeometry } from '../../core/types';
import { clamp, damp } from '../../core/math';

/** Rain streaks and snowflakes in a box between the camera and what it looks at. */
export class Precipitation {
  readonly rain: LineSegments;
  readonly snow: Points;
  private readonly rainPos: Float32Array;
  private readonly snowPos: Float32Array;
  private readonly drops: number;
  private readonly flakes: number;
  private rainAmount = 0;
  private snowAmount = 0;
  private readonly centre = new Vector3();
  private readonly fwd = new Vector3();
  private time = 0;

  constructor(count: number) {
    this.drops = count;
    this.flakes = count;
    this.rainPos = new Float32Array(count * 6);
    this.snowPos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < 3; k++) this.snowPos[i * 3 + k] = Math.random();
      for (let k = 0; k < 3; k++) this.rainPos[i * 6 + k] = Math.random();
    }
    const rg = new BufferGeometry();
    rg.setAttribute('position', new BufferAttribute(new Float32Array(count * 6), 3));
    this.rain = new LineSegments(rg, new LineBasicMaterial({ color: 0xc8ccd0, transparent: true, opacity: 0.28, depthWrite: false }));
    const sg = new BufferGeometry();
    sg.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
    this.snow = new Points(sg, new PointsMaterial({ color: 0xf2f4f7, size: 0.07, transparent: true, opacity: 0.85, depthWrite: false }));
    this.rain.frustumCulled = this.snow.frustumCulled = false;
    this.rain.renderOrder = this.snow.renderOrder = 21;
    this.rain.visible = this.snow.visible = false;
  }

  set(rain: number, snow: number): void {
    this.rainAmount = clamp(rain, 0, 1);
    this.snowAmount = clamp(snow, 0, 1);
  }

  update(dt: number, camera: Camera, distance: number, wind: number): void {
    this.time += dt;
    const size = clamp(distance * 0.5, 18, 90);
    camera.getWorldDirection(this.fwd);
    this.centre.setFromMatrixPosition(camera.matrixWorld).addScaledVector(this.fwd, size * 0.55);
    const cx = this.centre.x - size / 2;
    const cy = this.centre.y - size / 2;
    const cz = this.centre.z - size / 2;

    const nr = Math.round(this.drops * this.rainAmount);
    this.rain.visible = nr > 0;
    if (nr > 0) {
      const attr = this.rain.geometry.getAttribute('position') as BufferAttribute;
      const out = attr.array as Float32Array;
      const fall = 9 / size;
      for (let i = 0; i < nr; i++) {
        let y = this.rainPos[i * 6 + 1]! - fall * dt;
        if (y < 0) y += 1;
        this.rainPos[i * 6 + 1] = y;
        const x = cx + this.rainPos[i * 6]! * size;
        const z = cz + this.rainPos[i * 6 + 2]! * size;
        const py = cy + y * size;
        out[i * 6] = x;
        out[i * 6 + 1] = py;
        out[i * 6 + 2] = z;
        out[i * 6 + 3] = x - wind * 0.08;
        out[i * 6 + 4] = py + 0.55;
        out[i * 6 + 5] = z;
      }
      attr.needsUpdate = true;
      this.rain.geometry.setDrawRange(0, nr * 2);
    }
    const ns = Math.round(this.flakes * this.snowAmount);
    this.snow.visible = ns > 0;
    if (ns > 0) {
      const attr = this.snow.geometry.getAttribute('position') as BufferAttribute;
      const out = attr.array as Float32Array;
      const fall = 0.9 / size;
      for (let i = 0; i < ns; i++) {
        let y = this.snowPos[i * 3 + 1]! - fall * dt;
        if (y < 0) y += 1;
        this.snowPos[i * 3 + 1] = y;
        const drift = Math.sin(this.time * 0.7 + i) * 0.4;
        out[i * 3] = cx + this.snowPos[i * 3]! * size + drift;
        out[i * 3 + 1] = cy + y * size;
        out[i * 3 + 2] = cz + this.snowPos[i * 3 + 2]! * size + Math.cos(this.time * 0.5 + i * 1.7) * 0.3;
      }
      attr.needsUpdate = true;
      this.snow.geometry.setDrawRange(0, ns);
      (this.snow.material as PointsMaterial).size = 0.05 + size * 0.0015;
    }
  }

  dispose(): void {
    this.rain.geometry.dispose();
    (this.rain.material as LineBasicMaterial).dispose();
    this.snow.geometry.dispose();
    (this.snow.material as PointsMaterial).dispose();
  }
}

const BIRDS = 14;

/** A few dark birds circling high over the valley; they leave and return with `presence`. */
export class Birds {
  readonly mesh: InstancedMesh;
  private readonly weight = new Float32Array(BIRDS);
  private readonly phase = new Float32Array(BIRDS);
  private presence = 1;
  private time = Math.random() * 100;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly uTime = { value: 0 };
  centre = new Vector3();
  span = 60;

  constructor() {
    // Body and two wings; wingtip vertices carry aWing = 1 so the shader flaps them.
    const g = new BufferGeometry();
    const v = [0, 0, 0.22, 0, 0.02, -0.25, 0.04, 0, 0, 0, 0, 0.05, -0.45, 0, -0.08, 0, 0, -0.08, 0, 0, 0.05, 0.45, 0, -0.08, 0, 0, -0.08];
    const wing = [0, 0, 0, 0, 1, 0, 0, 1, 0];
    g.setAttribute('position', new Float32BufferAttribute(v, 3));
    g.setAttribute('aWing', new Float32BufferAttribute(wing, 1));
    for (let i = 0; i < BIRDS; i++) this.phase[i] = Math.random() * 10;
    g.setAttribute('aPhase', new InstancedBufferAttribute(this.phase, 1));
    const mat = new MeshBasicMaterial({ color: 0x2a2724, side: DoubleSide });
    const uTime = this.uTime;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms['uTime'] = uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aWing;\nattribute float aPhase;\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += aWing * sin(uTime * 9.0 + aPhase * 6.0) * 0.28 * (0.6 + 0.4 * sin(uTime * 0.7 + aPhase));');
    };
    this.mesh = new InstancedMesh(g, mat, BIRDS);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'birds';
  }

  setPresence(p: number): void {
    this.presence = clamp(p, 0, 1);
  }

  update(dt: number): void {
    this.time += dt;
    this.uTime.value = this.time;
    for (let i = 0; i < BIRDS; i++) {
      const want = i < Math.round(this.presence * BIRDS) ? 1 : 0;
      this.weight[i] = damp(this.weight[i]!, want, want ? 0.4 : 0.8, dt);
      const w = this.weight[i]!;
      const flock = i % 2;
      const r = this.span * (0.6 + flock * 0.5) + (i % 5) * 3;
      const speed = (0.11 + flock * 0.04) * (flock ? -1 : 1);
      const a = this.time * speed + i * 0.45;
      // Leaving birds climb and drift outwards until they are gone.
      const away = (1 - w) * 160;
      this.p.set(
        this.centre.x + Math.cos(a) * (r + away) + flock * this.span * 0.4,
        this.centre.y + 28 + flock * 14 + Math.sin(this.time * 0.5 + i) * 3 + away * 0.6,
        this.centre.z - this.span * 0.6 + Math.sin(a) * (r + away) * 0.6,
      );
      const heading = a + (speed > 0 ? Math.PI / 2 : -Math.PI / 2);
      this.q.setFromAxisAngle(this.up, -heading + Math.PI / 2);
      this.s.setScalar(w > 0.02 ? 1.6 : 0);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}

const LOGS = 32;

interface Log {
  z: number;
  x: number;
  speed: number;
  yaw: number;
  spin: number;
  len: number;
}

/** Floating timber in a flood. */
export class Driftwood {
  readonly mesh: InstancedMesh;
  private readonly logs: Log[] = [];
  private amount = 0;
  private spawnClock = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly axis = new Vector3(0, 1, 0);
  private openings: [number, number][] = [];

  constructor(
    private readonly channelX: (z: number) => number,
    private readonly surface: (z: number) => number,
    private readonly halfChannel: () => number,
    private readonly speed: () => number,
    private readonly zStart: number,
  ) {
    const g = new CylinderGeometry(0.13, 0.17, 1, 7, 1);
    g.rotateZ(Math.PI / 2);
    this.mesh = new InstancedMesh(g, new MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.95 }), LOGS);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'driftwood';
  }

  setAmount(a: number): void {
    this.amount = clamp(a, 0, 1);
  }

  /** Logs aim for the openings between piers so they pass under the arches. */
  setBridge(g: BridgeGeometry | null): void {
    this.openings = g ? g.spans.map((s) => [s.left.x, s.right.x] as [number, number]) : [];
  }

  update(dt: number): void {
    this.spawnClock += dt * this.amount * 1.6;
    while (this.spawnClock > 1 && this.logs.length < LOGS) {
      this.spawnClock -= 1;
      let x = (Math.random() * 2 - 1) * this.halfChannel() * 0.7;
      if (this.openings.length > 0) {
        const o = this.openings[Math.floor(Math.random() * this.openings.length)]!;
        x = (o[0] + o[1]) / 2 + (Math.random() - 0.5) * (o[1] - o[0]) * 0.5 - this.channelX(0);
      }
      this.logs.push({ z: this.zStart, x, speed: 0.8 + Math.random() * 0.4, yaw: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.3, len: 1.5 + Math.random() * 3 });
    }
    if (this.amount <= 0) this.spawnClock = 0;
    const v = Math.max(0.3, this.speed());
    for (let i = this.logs.length - 1; i >= 0; i--) {
      const l = this.logs[i]!;
      l.z -= v * l.speed * dt;
      l.yaw += l.spin * dt;
      if (l.z < -this.zStart * 1.5) this.logs.splice(i, 1);
    }
    this.logs.forEach((l, i) => {
      this.p.set(this.channelX(l.z) + l.x, this.surface(l.z) + 0.04 + Math.sin(l.z * 0.7) * 0.03, l.z);
      this.q.setFromAxisAngle(this.axis, l.yaw);
      this.s.set(l.len, 1, 1);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.count = this.logs.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
  }
}
