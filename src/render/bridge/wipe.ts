/**
 * The epilogue's hand on the stone: a soft mask over the bridge's elevation where moss and lichen
 * have been wiped off. Painted on the CPU into a small single-channel texture the stone shader
 * reads (uWipe, uWipeBox); uploaded at most once a frame.
 */
import { DataTexture, LinearFilter, RedFormat, UnsignedByteType } from 'three';
import type { BridgeGeometry, Vec2 } from '../../core/types';
import type { FieldUniforms } from './materials';

/** Texels per metre along the bridge, and the cap on the texture's width. */
const DENSITY = 24;
const MAX_W = 1024;

export class WipeMask {
  private readonly texture: DataTexture;
  private readonly data: Uint8Array;
  private readonly w: number;
  private readonly h: number;
  private readonly x0: number;
  private readonly y0: number;
  private readonly sx: number;
  private readonly sy: number;
  private dirty = false;

  constructor(
    geometry: BridgeGeometry,
    private readonly uniforms: FieldUniforms,
  ) {
    const deck = geometry.deck;
    let x0 = deck[0]?.x ?? -5;
    let x1 = deck[deck.length - 1]?.x ?? 5;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of deck) y1 = Math.max(y1, p.y + geometry.parapetHeight);
    for (const p of geometry.piers) y0 = Math.min(y0, p.base);
    for (const sp of geometry.spans) for (const p of sp.intrados) y0 = Math.min(y0, p.y);
    if (!Number.isFinite(y0)) y0 = -2;
    if (!Number.isFinite(y1)) y1 = 6;
    x0 -= 1;
    x1 += 1;
    y0 -= 1;
    y1 += 1;
    this.w = Math.max(16, Math.min(MAX_W, Math.ceil((x1 - x0) * DENSITY)));
    this.h = Math.max(16, Math.min(512, Math.ceil(((y1 - y0) * this.w) / (x1 - x0))));
    this.x0 = x0;
    this.y0 = y0;
    this.sx = x1 - x0;
    this.sy = y1 - y0;
    this.data = new Uint8Array(this.w * this.h);
    this.texture = new DataTexture(this.data, this.w, this.h, RedFormat, UnsignedByteType);
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearFilter;
    this.texture.needsUpdate = true;
    uniforms.uWipe.value = this.texture;
    uniforms.uWipeBox.value.set(this.x0, this.y0, this.sx, this.sy);
  }

  /** Wipe a soft round patch (radius in metres) at an elevation point; `strength` 0..1 per stroke. */
  paint(at: Vec2, radius: number, strength = 0.6): void {
    const cx = ((at.x - this.x0) / this.sx) * this.w;
    const cy = ((at.y - this.y0) / this.sy) * this.h;
    const rx = (radius / this.sx) * this.w;
    const ry = (radius / this.sy) * this.h;
    const i0 = Math.max(0, Math.floor(cx - rx));
    const i1 = Math.min(this.w - 1, Math.ceil(cx + rx));
    const j0 = Math.max(0, Math.floor(cy - ry));
    const j1 = Math.min(this.h - 1, Math.ceil(cy + ry));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot((i - cx) / Math.max(1e-6, rx), (j - cy) / Math.max(1e-6, ry));
        if (d >= 1) continue;
        const k = j * this.w + i;
        // A rag leaves a soft edge: full in the middle, fading to nothing at the rim.
        const add = 255 * strength * (1 - d * d);
        this.data[k] = Math.min(255, (this.data[k] as number) + add);
      }
    }
    this.dirty = true;
  }

  /** 0..1: how clean the stone is at a point. */
  at(p: Vec2): number {
    const i = Math.round(((p.x - this.x0) / this.sx) * this.w);
    const j = Math.round(((p.y - this.y0) / this.sy) * this.h);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return 0;
    return (this.data[j * this.w + i] as number) / 255;
  }

  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    if (this.uniforms.uWipe.value === this.texture) this.uniforms.uWipeBox.value.set(0, 0, 0, 0);
    this.texture.dispose();
  }
}
