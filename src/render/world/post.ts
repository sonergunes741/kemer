/**
 * The one WebGLRenderer and its post chain: scene into a half-float buffer, then subtle bloom
 * (high threshold: the sun, its streak, glints), AgX tone mapping with a gentle look (grade.ts),
 * a light vignette, and SMAA on high. Quality presets set the resolution and which passes run.
 */
import { BloomEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset, VignetteEffect } from 'postprocessing';
import { HalfFloatType, NoToneMapping, PCFShadowMap, SRGBColorSpace, WebGLRenderer, type PerspectiveCamera, type Scene } from 'three';
import { QUALITY, type QualityPreset } from '../../core/config';
import type { QualityId } from '../../core/types';
import { AgxLookEffect } from './grade';

export class Renderer {
  readonly renderer: WebGLRenderer;
  readonly composer: EffectComposer;
  private passes: EffectPass[] = [];
  preset: QualityPreset;
  quality: QualityId;
  private cssWidth = 1;
  private cssHeight = 1;
  private deviceRatio = 1;

  constructor(canvas: HTMLCanvasElement, scene: Scene, private readonly camera: PerspectiveCamera, quality: QualityId) {
    this.quality = quality;
    this.preset = QUALITY[quality];
    this.renderer = new WebGLRenderer({ canvas, antialias: false, stencil: false, depth: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    // Shadows are drawn once per frame on purpose (see the world's render), not on every render call.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.info.autoReset = false;

    this.composer = new EffectComposer(this.renderer, { frameBufferType: HalfFloatType, multisampling: 0 });
    this.composer.addPass(new RenderPass(scene, camera));
    this.apply();
  }

  /** CSS size of the canvas. */
  get width(): number {
    return this.cssWidth;
  }

  get height(): number {
    return this.cssHeight;
  }

  setQuality(quality: QualityId): void {
    this.quality = quality;
    this.preset = QUALITY[quality];
    this.apply();
  }

  /**
   * Rebuild the effect passes for the preset. Disposing an EffectPass disposes its effects, so
   * the effects are made anew each time (this only happens when the quality changes).
   */
  private apply(): void {
    const p = this.preset;
    for (const pass of this.passes) {
      this.composer.removePass(pass);
      pass.dispose();
    }
    const tone = new AgxLookEffect();
    const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.42 });
    const main = p.bloom
      ? new EffectPass(this.camera, new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.6, luminanceSmoothing: 0.5, intensity: 0.45, radius: 0.72 }), tone, vignette)
      : new EffectPass(this.camera, tone, vignette);
    this.passes = [main];
    if (p.smaa) this.passes.push(new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
    for (const pass of this.passes) this.composer.addPass(pass);
    this.resize(this.cssWidth, this.cssHeight, this.deviceRatio);
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.cssWidth = Math.max(1, Math.floor(width));
    this.cssHeight = Math.max(1, Math.floor(height));
    this.deviceRatio = pixelRatio;
    const ratio = Math.min(pixelRatio, this.preset.maxPixelRatio) * this.preset.renderScale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(this.cssWidth, this.cssHeight, false);
    this.composer.setSize(this.cssWidth, this.cssHeight, false);
  }

  /** Drawing-buffer size in device pixels. */
  bufferSize(): { width: number; height: number } {
    const r = this.renderer.getPixelRatio();
    return { width: Math.round(this.cssWidth * r), height: Math.round(this.cssHeight * r) };
  }

  render(dt: number): void {
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
    this.renderer.dispose();
  }
}
