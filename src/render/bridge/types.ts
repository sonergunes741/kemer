/** Types shared inside the bridge view. */
import type { StonePart } from '../../core/bus';
import type { Vec2, Vec3 } from '../../core/types';

export type StoneKind =
  | 'voussoir'
  | 'keystone'
  | 'pier'
  | 'cutwater'
  | 'skewback'
  | 'spandrel'
  | 'abutment'
  | 'relief'
  | 'parapet'
  | 'coping'
  | 'paving';

/** The bus names a stone by the part of the work it belongs to. */
export const PART_OF: Readonly<Record<StoneKind, StonePart>> = {
  voussoir: 'voussoir',
  keystone: 'keystone',
  pier: 'pier',
  cutwater: 'pier',
  skewback: 'pier',
  spandrel: 'spandrel',
  abutment: 'spandrel',
  relief: 'spandrel',
  parapet: 'parapet',
  coping: 'parapet',
  paving: 'paving',
};

export interface StoneShape {
  /**
   * `xy`: an elevation outline (x, y) extruded across the bridge from z = w0 to w1.
   * `xz`: a plan outline (x, z) extruded upwards from y = w0 to w1.
   * `zy`: a cross-section (z, y) extruded along the bridge from x = w0 to w1.
   */
  readonly plane: 'xy' | 'xz' | 'zy';
  readonly poly: readonly Vec2[];
  readonly w0: number;
  readonly w1: number;
  /** A loft: the outline at w1 (same vertex count). Lofts are not bevelled. */
  readonly top?: readonly Vec2[];
}

export interface StoneSpec {
  readonly kind: StoneKind;
  readonly shape: StoneShape;
  /** Span of a ring stone, or of the ring a wall stone stands on; -1 for none. */
  readonly span: number;
  /** Voussoir index of a ring stone; -1 otherwise. */
  readonly voussoir: number;
  /** Pier of a pier stone; -1 otherwise. */
  readonly pier: number;
  /** Ring course a wall stone rides on when the ring moves ([-1, -1]: none). */
  readonly follow: readonly [number, number];
  /** Pier whose settlement a stone shares (-1: none). */
  readonly followPier: number;
  /** Centre of the stone: rotations are about this point. */
  readonly pivot: Vec3;
  /** m3, for the mass of thuds and of rigid bodies. */
  readonly volume: number;
  /** Ordering key within its phase (lower first). */
  readonly order: number;
  /** 0: dressed stone; 1: paving. */
  readonly material: 0 | 1;
  /** One of the extra arches beyond the abutments (Uzunköprü). */
  readonly arcade: boolean;
}

/** How finely the layout cuts the bridge. */
export interface LayoutDetail {
  /** 0: one stone across the full width of a ring course; 1, 2: split and staggered. */
  readonly split: 0 | 1 | 2;
  readonly bevel: number;
  readonly chamfer: number;
}
