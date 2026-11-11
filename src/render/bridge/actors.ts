/**
 * The people and animals that cross: GLB models loaded on demand (vertex colours kept), cloned per
 * use, and a small rig that swings legs and arms, turns wheels and bobs the body with the
 * distance walked. Models face +X with their left side towards -Z.
 */
import { Group, Mesh, type Object3D } from 'three';
import { hasModel, modelUrl, type ModelId } from '../../core/assets';
import { log } from '../../core/log';

type LoaderModule = typeof import('three/addons/loaders/GLTFLoader.js');

interface Limb {
  readonly node: Object3D;
  readonly rest: number;
  /** Fraction of a gait cycle this limb lags behind. */
  readonly phase: number;
  readonly amp: number;
}

interface Wheel {
  readonly node: Object3D;
  readonly radius: number;
}

/** Gait offsets (fraction of a cycle): a four-beat walk for animals, opposite legs for people. */
const GAIT: Readonly<Record<string, number>> = { fl: 0, br: 0.25, fr: 0.5, bl: 0.75, l: 0, r: 0.5 };

export class Rig {
  readonly root: Group;
  private readonly limbs: Limb[] = [];
  private readonly arms: Limb[] = [];
  private readonly wheels: Wheel[] = [];
  private readonly heads: Limb[] = [];
  private readonly bodies: { node: Object3D; y: number; phase: number }[] = [];
  private readonly stride: number;
  private cycle = 0;
  private lastHalf = 0;

  constructor(
    template: Object3D,
    readonly length: number,
  ) {
    this.root = new Group();
    const model = template.clone(true);
    this.root.add(model);
    let legHeight = 0;
    model.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
      }
      const m = /^(leg|arm|wheel|head|body)(?:_([a-z]+))?(?:_(\d))?$/.exec(o.name);
      if (!m) return;
      const [, part, side = '', unit = '0'] = m;
      const lag = Number(unit) * 0.37;
      if (part === 'leg') {
        this.limbs.push({ node: o, rest: o.rotation.z, phase: (GAIT[side] ?? 0) + lag, amp: side.length === 1 ? 0.45 : 0.32 });
        legHeight = Math.max(legHeight, o.position.y);
      } else if (part === 'arm') this.arms.push({ node: o, rest: o.rotation.z, phase: (GAIT[side] ?? 0) + 0.5, amp: 0.35 });
      else if (part === 'wheel') this.wheels.push({ node: o, radius: Math.max(0.15, o.position.y) });
      else if (part === 'head') this.heads.push({ node: o, rest: o.rotation.z, phase: lag, amp: 0.05 });
      else if (part === 'body' && side === '' && m[3]) this.bodies.push({ node: o, y: o.position.y, phase: lag });
    });
    if (this.bodies.length === 0) this.bodies.push({ node: model, y: model.position.y, phase: 0 });
    // A stride about as long as the legs are tall; wheels need none.
    this.stride = Math.max(0.6, legHeight * 1.5);
  }

  /** Advance by `distance` metres walked; returns true when a foot falls (twice per cycle). */
  walk(distance: number): boolean {
    this.cycle += distance / this.stride;
    const tau = Math.PI * 2;
    for (const l of this.limbs) l.node.rotation.z = l.rest + Math.sin((this.cycle + l.phase) * tau) * l.amp;
    for (const a of this.arms) a.node.rotation.z = a.rest + Math.sin((this.cycle + a.phase) * tau) * a.amp;
    for (const h of this.heads) h.node.rotation.z = h.rest + Math.sin((this.cycle * 2 + h.phase) * tau) * h.amp;
    for (const w of this.wheels) w.node.rotation.z -= distance / w.radius;
    if (this.limbs.length > 0) {
      for (const b of this.bodies) b.node.position.y = b.y + Math.abs(Math.sin((this.cycle + b.phase) * tau)) * 0.03;
    }
    const half = Math.floor(this.cycle * 2);
    const step = half !== this.lastHalf;
    this.lastHalf = half;
    return step && (this.limbs.length > 0 || this.wheels.length > 0);
  }
}

/** Loads and caches actor models. */
export class ActorLibrary {
  private loader: Promise<InstanceType<LoaderModule['GLTFLoader']> | null> | null = null;
  private readonly models = new Map<ModelId, Promise<Object3D | null>>();
  private readonly loaded: Object3D[] = [];

  private getLoader(): Promise<InstanceType<LoaderModule['GLTFLoader']> | null> {
    this.loader ??= import('three/addons/loaders/GLTFLoader.js')
      .then((m) => new m.GLTFLoader())
      .catch((err: unknown) => {
        log.once('bridge:gltf', 'bridge', 'GLTFLoader could not load; no traffic', err);
        return null;
      });
    return this.loader;
  }

  get(id: ModelId): Promise<Object3D | null> {
    let p = this.models.get(id);
    if (!p) {
      p = this.load(id);
      this.models.set(id, p);
    }
    return p;
  }

  private async load(id: ModelId): Promise<Object3D | null> {
    if (!hasModel(id)) {
      log.once(`bridge:model:${id}`, 'bridge', `model ${id} is not in the manifest`);
      return null;
    }
    const loader = await this.getLoader();
    if (!loader) return null;
    try {
      const gltf = await loader.loadAsync(modelUrl(id));
      this.loaded.push(gltf.scene);
      return gltf.scene;
    } catch (err) {
      log.once(`bridge:model:${id}`, 'bridge', `model ${id} failed to load`, err);
      return null;
    }
  }

  dispose(): void {
    for (const scene of this.loaded) {
      scene.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) m.dispose();
      });
    }
    this.loaded.length = 0;
    this.models.clear();
  }
}
