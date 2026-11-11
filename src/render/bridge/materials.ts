/**
 * The bridge's materials: dressed stone, paving and the cut mark, all MeshStandardMaterial
 * extended through onBeforeCompile with the stone-field transform and the weathering layers, plus
 * the matching depth material for shadows. Uniform objects are shared, so one write reaches every
 * material.
 */
import { Color, MeshDepthMaterial, MeshStandardMaterial, Vector2, Vector3, Vector4, type DataTexture, type IUniform, type Texture } from 'three';
import type { StoneId } from '../../core/types';
import { blankTexture, type TextureSet } from './textures';
import {
  SURFACE_AO,
  SURFACE_MAP,
  SURFACE_NORMAL,
  SURFACE_PARS,
  SURFACE_ROUGHNESS,
  XF_BEGIN,
  XF_BEGIN_DEPTH,
  XF_BEGINNORMAL,
  XF_PARS,
  XF_PARS_DEPTH,
  XF_WORLDPOS,
} from './stoneShader';

/** Flat colours when a stone's texture set is missing (and the tint over the texture otherwise). */
export const STONE_COLOR: Readonly<Record<StoneId, number>> = {
  tuff: 0xcbb69a,
  andesite: 0x8f8a83,
  limestone: 0xd2c8b4,
  basalt: 0x4c4945,
  granite: 0xaaa59c,
};

/** Metres covered by one tile of each texture set (public/assets/CREDITS.md). */
export const STONE_TILE: Readonly<Record<StoneId, number>> = {
  tuff: 2.0,
  andesite: 1.5,
  limestone: 1.8,
  basalt: 2.0,
  granite: 2.0,
};

export interface FieldUniforms {
  uXf: IUniform<DataTexture>;
  uXfCols: IUniform<number>;
  uColorMap: IUniform<Texture>;
  uNormalMap: IUniform<Texture>;
  uArmMap: IUniform<Texture>;
  uMossMap: IUniform<Texture>;
  uHasMap: IUniform<number>;
  uHasMoss: IUniform<number>;
  uTile: IUniform<number>;
  uMoss: IUniform<number>;
  uPatina: IUniform<number>;
  uSnow: IUniform<number>;
  uWater: IUniform<number>;
  uWaterRough: IUniform<number>;
  uFloodLine: IUniform<number>;
  uJoint: IUniform<number>;
  uNormalScale: IUniform<number>;
  uHover: IUniform<Vector2>;
  uSunDir: IUniform<Vector3>;
  uMossColor: IUniform<Color>;
  uHalfWidth: IUniform<number>;
  /** Where moss has been wiped off by hand (the epilogue): a mask over the elevation, and its box. */
  uWipe: IUniform<Texture>;
  uWipeBox: IUniform<Vector4>;
  /** 0..1 the epilogue's coat of moss and lichen inside the wipe box. */
  uOvergrowth: IUniform<number>;
}

const blanks = { white: blankTexture(255, 255, 255), normal: blankTexture(128, 128, 255) };

export function fieldUniforms(xf: DataTexture, cols: number): FieldUniforms {
  return {
    uXf: { value: xf },
    uXfCols: { value: cols },
    uColorMap: { value: blanks.white },
    uNormalMap: { value: blanks.normal },
    uArmMap: { value: blanks.white },
    uMossMap: { value: blanks.white },
    uHasMap: { value: 0 },
    uHasMoss: { value: 0 },
    uTile: { value: 0.5 },
    uMoss: { value: 0 },
    uPatina: { value: 0 },
    uSnow: { value: 0 },
    uWater: { value: 0 },
    uWaterRough: { value: 0.1 },
    uFloodLine: { value: 1 },
    uJoint: { value: 0 },
    uNormalScale: { value: 1.2 },
    uHover: { value: new Vector2(-10, -10) },
    uSunDir: { value: new Vector3(0.3, 0.8, 0.5).normalize() },
    uMossColor: { value: new Color(0x56633a) },
    uHalfWidth: { value: 2 },
    uWipe: { value: blanks.white },
    // An empty box: nothing wiped until the epilogue paints the mask.
    uWipeBox: { value: new Vector4(0, 0, 0, 0) },
    uOvergrowth: { value: 0 },
  };
}

export function setTextures(u: FieldUniforms, set: TextureSet | null, tile: number): void {
  u.uColorMap.value = set?.color ?? blanks.white;
  u.uNormalMap.value = set?.normal ?? blanks.normal;
  u.uArmMap.value = set?.arm ?? blanks.white;
  u.uHasMap.value = set ? 1 : 0;
  u.uTile.value = 1 / tile;
}

export function setMossTexture(u: FieldUniforms, set: TextureSet | null): void {
  u.uMossMap.value = set?.color ?? blanks.white;
  u.uHasMoss.value = set ? 1 : 0;
}

export type StoneVariant = 'stone' | 'paving' | 'mark';

/** A stone-field material sharing `u` (each variant keeps its own texture uniforms where it differs). */
export function stoneMaterial(u: FieldUniforms, variant: StoneVariant, color: number): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color, roughness: variant === 'mark' ? 1 : 0.92, metalness: 0 });
  if (variant === 'paving') m.defines = { KEMER_WORLD_UV: '' };
  if (variant === 'mark') {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
  }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${XF_PARS}`)
      .replace('#include <beginnormal_vertex>', XF_BEGINNORMAL)
      .replace('#include <begin_vertex>', XF_BEGIN)
      .replace('#include <worldpos_vertex>', XF_WORLDPOS);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SURFACE_PARS}`)
      .replace('#include <map_fragment>', SURFACE_MAP)
      .replace('#include <roughnessmap_fragment>', SURFACE_ROUGHNESS)
      .replace('#include <normal_fragment_maps>', SURFACE_NORMAL)
      .replace('#include <aomap_fragment>', SURFACE_AO);
  };
  m.customProgramCacheKey = () => `kemer-stone-${variant}`;
  return m;
}

/** Shadow-pass material: the same transform, nothing else. */
export function depthMaterial(u: FieldUniforms): MeshDepthMaterial {
  const m = new MeshDepthMaterial();
  m.onBeforeCompile = (shader) => {
    shader.uniforms['uXf'] = u.uXf;
    shader.uniforms['uXfCols'] = u.uXfCols;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${XF_PARS_DEPTH}`)
      .replace('#include <begin_vertex>', XF_BEGIN_DEPTH);
  };
  m.customProgramCacheKey = () => 'kemer-stone-depth';
  return m;
}
