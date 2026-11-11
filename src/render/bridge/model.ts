/**
 * One bridge in stone: its layout, the stone field with its materials, and the state of every
 * stone (laid or not, where the centuries have moved it). Animations write poses on top of the
 * base state through `writePose`.
 */
import { Group, Quaternion, type MeshStandardMaterial } from 'three';
import type { BridgeGeometry, LevelDef } from '../../core/types';
import { mulberry32 } from '../../core/rng';
import { StoneField } from './field';
import { buildLayout, type Layout } from './layout';
import { depthMaterial, fieldUniforms, setMossTexture, setTextures, STONE_COLOR, STONE_TILE, stoneMaterial, type FieldUniforms } from './materials';
import type { TextureCache } from './textures';
import type { StoneSpec } from './types';

const PAVING_COLOR = 0xb8ab98;

export interface Detail {
  split: 0 | 1 | 2;
  bevel: number;
  chamfer: number;
  /** Chamfer the piers too (their vertical joints are long edges). */
  pierChamfer: boolean;
}

export const DETAIL: Readonly<Record<0 | 1 | 2, Detail>> = {
  0: { split: 0, bevel: 0.016, chamfer: 0, pierChamfer: false },
  1: { split: 1, bevel: 0.02, chamfer: 0.016, pierChamfer: false },
  2: { split: 2, bevel: 0.022, chamfer: 0.018, pierChamfer: true },
};

const _q = new Quaternion();

export class BridgeModel {
  readonly group = new Group();
  readonly layout: Layout;
  readonly field: StoneField;
  readonly uniforms: FieldUniforms;
  readonly pavingUniforms: FieldUniforms;
  readonly materials: MeshStandardMaterial[];
  readonly count: number;
  readonly stones: readonly StoneSpec[];
  /** 1 once a stone is in the work. */
  readonly laid: Uint8Array;
  /** Base displacement in the elevation plane: dx, dy, rotation about z (radians) about the pivot. */
  readonly base: Float32Array;
  /** Dead stones (fallen spans, washed away): never drawn again. */
  readonly gone: Uint8Array;
  private readonly depth;

  constructor(
    readonly level: LevelDef,
    readonly geometry: BridgeGeometry,
    readonly detail: Detail,
    textures: TextureCache,
  ) {
    this.layout = buildLayout(level, geometry, detail.split);
    this.stones = this.layout.stones;
    this.count = this.stones.length;
    const rng = mulberry32((level.site.seed ^ 0x5bd1e995) >>> 0);
    this.field = new StoneField(
      this.layout,
      (s) => {
        const ring = s.kind === 'voussoir' || s.kind === 'keystone';
        const chamfer = ring || (s.kind === 'pier' && detail.pierChamfer) ? detail.chamfer : 0;
        if (s.material === 1) return { bevel: 0, chamfer: 0, gap: 0 };
        return { bevel: s.kind === 'coping' ? detail.bevel * 1.5 : detail.bevel, chamfer, gap: 0.004 };
      },
      rng,
    );
    this.laid = new Uint8Array(this.count);
    this.gone = new Uint8Array(this.count);
    this.base = new Float32Array(this.count * 3);
    this.uniforms = fieldUniforms(this.field.xf, 256);
    this.uniforms.uFloodLine.value = level.site.flood.stage2;
    this.uniforms.uHalfWidth.value = geometry.width / 2;
    this.pavingUniforms = {
      ...this.uniforms,
      uColorMap: { value: this.uniforms.uColorMap.value },
      uNormalMap: { value: this.uniforms.uNormalMap.value },
      uArmMap: { value: this.uniforms.uArmMap.value },
      uHasMap: { value: 0 },
      uTile: { value: 0.5 },
      uNormalScale: { value: 0.8 },
    };
    const stone = stoneMaterial(this.uniforms, 'stone', 0xffffff);
    const paving = stoneMaterial(this.pavingUniforms, 'paving', 0xffffff);
    stone.color.setHex(STONE_COLOR[level.stone]);
    paving.color.setHex(PAVING_COLOR);
    this.materials = [stone, paving];
    this.depth = depthMaterial(this.uniforms);
    this.field.build(stone, paving, this.depth);
    this.group.add(...this.field.meshes);
    this.group.name = 'kemer-bridge-stones';
    void this.loadTextures(textures);
    for (let i = 0; i < this.count; i++) this.writePose(i);
  }

  private async loadTextures(cache: TextureCache): Promise<void> {
    const id = this.level.stone;
    const [stone, paving, moss] = await Promise.all([cache.get(`stone-${id}`), cache.get('paving'), cache.get('moss')]);
    // With a texture the material colour is a gentle tint; without, it is the stone's colour.
    if (stone) this.materials[0]!.color.setHex(0xffffff);
    if (paving) this.materials[1]!.color.setHex(0xffffff);
    setTextures(this.uniforms, stone, STONE_TILE[id]);
    setTextures(this.pavingUniforms, paving, 2);
    setMossTexture(this.uniforms, moss);
  }

  /** Draw stone i at its base state (hidden unless laid). */
  writePose(i: number, scale = 1): void {
    if (!this.laid[i] || this.gone[i]) {
      this.field.setPose(i, 0, 0, -1000, 0, 0, 0, 1, 0);
      return;
    }
    const b = this.base;
    const rot = b[i * 3 + 2]!;
    _q.set(0, 0, Math.sin(rot / 2), Math.cos(rot / 2));
    this.field.setPose(i, b[i * 3]!, b[i * 3 + 1]!, 0, _q.x, _q.y, _q.z, _q.w, scale);
  }

  /** Base pose plus an animation offset and rotation (rotation applied after the base one). */
  writeAnimated(i: number, ox: number, oy: number, oz: number, q: Quaternion, scale = 1): void {
    const b = this.base;
    const rot = b[i * 3 + 2]!;
    _q.set(0, 0, Math.sin(rot / 2), Math.cos(rot / 2)).premultiply(q);
    this.field.setPose(i, b[i * 3]! + ox, b[i * 3 + 1]! + oy, oz, _q.x, _q.y, _q.z, _q.w, scale);
  }

  setLaid(i: number, on: boolean): void {
    this.laid[i] = on ? 1 : 0;
    this.writePose(i);
  }

  layAll(): void {
    this.laid.fill(1);
    for (let i = 0; i < this.count; i++) this.writePose(i);
  }

  /** Is stone i one of the designed spans' ring stones? */
  isRing(i: number): boolean {
    const k = this.stones[i]!.kind;
    return (k === 'voussoir' || k === 'keystone') && !this.stones[i]!.arcade;
  }

  dispose(): void {
    this.field.dispose();
    for (const m of this.materials) m.dispose();
    this.depth.dispose();
  }
}

export type { Layout };
