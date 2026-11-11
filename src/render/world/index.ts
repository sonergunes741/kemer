/**
 * The world module: renderer, sky, light, landscape, river, plants, particles and the camera
 * rig behind the WorldApi contract. See docs/ARCHITECTURE.md, "Rendering decisions".
 */
import { Color, Scene, Vector3, type Object3D } from 'three';
import type { Bus } from '../../core/bus';
import type { CameraRig, FxApi, WaterState, WorldApi, WorldTime } from '../../core/contracts';
import type { BridgeGeometry, LevelDef, QualityId, Vec2 } from '../../core/types';
import { clamp, clamp01, lerp } from '../../core/math';
import { log } from '../../core/log';
import { Atmosphere } from './atmosphere';
import { BIOMES, type SpeciesId } from './biomes';
import { Precipitation } from './ambient';
import { Rig, projectToCss, unprojectToPlaneZ } from './camera';
import { Fx } from './fx';
import { installHaze } from './haze';
import { Landscape, type SharedTextures } from './landscape';
import { loadPlantModels, type PlantModel } from './models';
import { Particles } from './particles';
import { Renderer } from './post';
import { PlanarReflection } from './reflection';
import { blendLook, climateWeather, seasonLook, type Climate, type SeasonLook } from './seasons';
import { SkyDome } from './sky';
import { createLeafAtlas, createNoiseTexture, createWaterTexture } from './textures';

export interface WorldStats {
  /** Draw calls and triangles of the last frame (all passes: shadow, reflection, main, post). */
  readonly calls: number;
  readonly triangles: number;
  /** CPU time of the last render() call, ms. */
  readonly cpuMs: number;
}

/** WorldApi plus read-outs for the harness. */
export interface World extends WorldApi {
  stats(): WorldStats;
}

const ENV_SIZE: Record<QualityId, number> = { low: 64, medium: 128, high: 256 };
const ENV_INTENSITY = 0.6;

class WorldImpl implements World {
  readonly scene = new Scene();
  readonly rig: Rig;
  readonly fx: FxApi;
  private readonly fxHub: Fx;
  private readonly view: Renderer;
  private readonly sky: SkyDome;
  private readonly atmosphere: Atmosphere;
  private readonly reflection = new PlanarReflection();
  private readonly particles: Particles;
  private readonly precip: Precipitation;
  private readonly shared: SharedTextures;
  private land: Landscape | null = null;
  private level: LevelDef | null = null;
  private bridge: BridgeGeometry | null = null;
  private models: ReadonlyMap<string, PlantModel> = new Map();
  /** Species whose models have been fetched (or tried), so each is fetched once. */
  private readonly modelsAsked = new Set<SpeciesId>();
  private time: WorldTime = { year: 1500, season: 0.55, hour: 15.5, lapse: 0 };
  private lastYear = 1500;
  private yearRate = 0;
  private readonly look: SeasonLook = seasonLook(0.55, { winter: 0.3, wet: 0.3, arid: 0.3 });
  private readonly lookTarget: SeasonLook = seasonLook(0.55, { winter: 0.3, wet: 0.3, arid: 0.3 });
  private climate: Climate = { winter: 0.3, wet: 0.3, arid: 0.3 };
  private loadToken = 0;
  private lastDt = 1 / 60;
  private cpuMs = 0;
  private readonly shadowCentre = new Vector3();
  private shadowRadius = 40;

  constructor(canvas: HTMLCanvasElement, bus: Bus, quality: QualityId) {
    installHaze();
    this.rig = new Rig();
    this.view = new Renderer(canvas, this.scene, this.rig.camera, quality);
    this.shared = { noise: createNoiseTexture(256, 7), waves: createWaterTexture(256, 11), atlas: createLeafAtlas(5) };
    this.sky = new SkyDome(this.view.renderer, this.shared.noise);
    this.sky.setRadius(9000);
    this.atmosphere = new Atmosphere(this.sky);
    this.scene.add(this.sky.mesh, this.atmosphere.sun, this.atmosphere.sun.target, this.atmosphere.hemi);
    this.scene.fog = this.atmosphere.fog;
    this.particles = new Particles(1400, (x, z) => this.land?.field.height(x, z) ?? -Infinity, (z) => this.land?.river.surfaceAt(z) ?? -Infinity);
    this.precip = new Precipitation(1500);
    this.scene.add(this.particles.points, this.precip.rain, this.precip.snow);
    this.fxHub = new Fx({
      particles: () => this.particles,
      river: () => this.land?.river ?? null,
      driftwood: () => this.land?.driftwood ?? null,
      birds: () => this.land?.birds ?? null,
      shake: (a) => this.rig.shake(a),
      sustainShake: (a) => this.rig.sustain(a),
    });
    this.fx = this.fxHub;
    this.fxHub.listen(bus);
    this.applyQuality();
  }

  async load(level: LevelDef): Promise<void> {
    const token = ++this.loadToken;
    // Only the plants this river's banks grow; another biome's models come when its river does.
    const biome = BIOMES[level.env.biome] ?? BIOMES['green-valley'];
    const wanted = new Set(biome.plants.map((p) => p.species).filter((s) => !this.modelsAsked.has(s)));
    if (wanted.size > 0) {
      for (const s of wanted) this.modelsAsked.add(s);
      const more = await loadPlantModels(wanted);
      this.models = new Map([...this.models, ...more]);
    }
    const land = await Landscape.create(level, this.shared, this.view.preset.stoneDetail === 0 ? 0.7 : 1, this.models);
    if (token !== this.loadToken) {
      land.dispose();
      return;
    }
    if (this.land) {
      this.scene.remove(this.land.group);
      this.land.dispose();
    }
    this.land = land;
    this.level = level;
    this.bridge = null;
    this.scene.add(land.group);
    const env = level.env;
    this.climate = { winter: env.winter, wet: env.wet, arid: clamp01(1 - env.wet * 1.4) };
    this.atmosphere.setSite(env.latitude, ((env.seed % 41) / 41 - 0.5) * 0.12, land.biome);
    this.fxHub.setStoneColor(land.dustColor());
    this.rig.floor = (x, z) => Math.max(land.field.height(x, z), land.river.surfaceAt(z));
    land.birds.setPresence(this.fxHub.ambientLife ? this.fxHub.birdPresence : 0);
    const site = level.site;
    const span = site.right - site.left;
    this.fitShadow(new Vector3((site.left + site.right) / 2, site.springLevel, 0), clamp(span * 0.8 + 14, 18, 420));
    this.reflection.scale = this.view.preset.reflection;
    this.applyQuality();
    // A sensible first view: the upstream face, a little from the side, river in front.
    const length = Math.max(6, span);
    this.rig.set({ target: { x: (site.left + site.right) / 2, y: site.springLevel + length * 0.12, z: 0 }, distance: length * 2.6 + 12, yaw: 0.35, pitch: 0.16, fov: 38 });
    this.lastYear = this.time.year;
    // The sky of the new site is rebuilt on the first frame, once its sun has been placed.
    this.atmosphere.invalidateEnv();
  }

  async warmUp(): Promise<void> {
    const r = this.view.renderer;
    this.updateFrame(0);
    try {
      r.setRenderTarget(this.view.composer.inputBuffer);
      await r.compileAsync(this.scene, this.rig.camera);
    } catch (err) {
      log.warn('world', 'shader warm-up failed; the first frame may stall', err);
    } finally {
      r.setRenderTarget(null);
    }
    this.render();
  }

  setQuality(quality: QualityId): void {
    this.view.setQuality(quality);
    this.applyQuality();
  }

  private applyQuality(): void {
    const p = this.view.preset;
    this.reflection.scale = p.reflection;
    this.particles.budget = p.particles;
    this.sky.setEnvSize(ENV_SIZE[this.view.quality]);
    this.land?.plants.setDensity(p.plants);
    this.atmosphere.fitShadow(this.shadowCentre, this.shadowRadius, p.shadowMap);
    this.view.renderer.shadowMap.enabled = p.shadowMap > 0;
    this.resizeTargets();
  }

  setReducedMotion(on: boolean): void {
    this.rig.reducedMotion = on;
  }

  setAmbientLife(on: boolean): void {
    this.fxHub.setAmbientLife(on);
  }

  setTime(time: WorldTime): void {
    this.time = { year: time.year, season: ((time.season % 1) + 1) % 1, hour: clamp(time.hour, 0, 24), lapse: clamp01(time.lapse) };
  }

  setWater(water: WaterState): void {
    this.land?.river.setState(water);
  }

  setBridge(geometry: BridgeGeometry | null, scour?: readonly number[]): void {
    const changed = geometry !== this.bridge;
    this.bridge = geometry;
    this.land?.river.setBridge(geometry, scour);
    if (!changed) return;
    this.land?.driftwood.setBridge(geometry);
    if (geometry && geometry.deck.length > 0) {
      const x0 = geometry.deck[0]!.x;
      const x1 = geometry.deck[geometry.deck.length - 1]!.x;
      let top = 0;
      for (const p of geometry.deck) top = Math.max(top, p.y);
      this.fitShadow(new Vector3((x0 + x1) / 2, top * 0.5, 0), clamp((x1 - x0) * 0.75 + 14, 18, 420));
    }
  }

  private fitShadow(centre: Vector3, radius: number): void {
    this.shadowCentre.copy(centre);
    this.shadowRadius = radius;
    this.atmosphere.fitShadow(centre, radius, this.view.preset.shadowMap);
  }

  private planeZ(): number {
    return (this.bridge?.width ?? this.level?.site.width ?? 4) / 2;
  }

  toScreen(point: Vec2, out: Vec2 = { x: 0, y: 0 }): Vec2 {
    return projectToCss(this.rig.camera, { x: point.x, y: point.y, z: this.planeZ() }, this.view.width, this.view.height, out);
  }

  fromScreen(x: number, y: number): Vec2 | null {
    return unprojectToPlaneZ(this.rig.camera, x, y, this.view.width, this.view.height, this.planeZ());
  }

  groundAt(x: number, z: number): number {
    // The same surface the camera rig keeps its eye above.
    return this.rig.floor(x, z);
  }

  update(dt: number): void {
    const step = clamp(dt, 0, 0.1);
    this.lastDt = step;
    this.updateFrame(step);
  }

  private updateFrame(dt: number): void {
    const time = this.time;
    if (dt > 0) {
      const rate = Math.abs(time.year - this.lastYear) / dt;
      this.yearRate = lerp(this.yearRate, Math.max(rate, this.fxHub.yearsPerSecond * time.lapse), 1 - Math.exp(-dt * 4));
    }
    this.lastYear = time.year;
    this.rig.update(dt);
    this.fxHub.update();

    // Seasons fold into their average once years pass faster than a few a second.
    seasonLook(time.season, this.climate, this.lookTarget);
    blendLook(this.look, this.lookTarget, dt, clamp(this.yearRate * 0.5, 0.04, 1.2));

    const auto = climateWeather(time.season, time.year, this.climate);
    const calm = 1 - smooth01(time.lapse * 2);
    const weather = {
      rain: Math.max(this.fxHub.forced.rain, auto.rain * calm * 0.6),
      snow: Math.max(this.fxHub.forced.snow, auto.snow * calm * 0.7),
    };
    this.atmosphere.update(time, dt, weather, this.rig.camera);
    const land = this.land;
    if (land) this.updateLand(land, dt, weather);
    const light = this.atmosphere.sunColor.clone().multiplyScalar(this.atmosphere.sun.intensity * 0.25).add(this.atmosphere.zenith.clone().multiplyScalar(1.1));
    this.particles.light.copy(light);
    const pixels = this.view.bufferSize().height / (2 * Math.tan((this.rig.camera.fov * Math.PI) / 360));
    this.particles.setScale(pixels);
    this.particles.update(dt);
    this.precip.set(weather.rain, weather.snow);
    this.precip.update(dt, this.rig.camera, this.rig.viewDistance, (land?.biome.wind ?? 0.5) * 4);
  }

  private updateLand(land: Landscape, dt: number, weather: { rain: number; snow: number }): void {
    const look = this.look;
    const b = land.biome;
    const t = land.terrain.uniforms;
    const g = t.uGrass.value;
    g.setRGB(0, 0, 0);
    const add = (hex: number, w: number): void => {
      const c = new Color(hex);
      g.r += c.r * w;
      g.g += c.g * w;
      g.b += c.b * w;
    };
    add(b.grass.spring, look.spring);
    add(b.grass.summer, look.summer);
    add(b.grass.autumn, look.fall);
    add(b.grass.winter, look.winter);
    const water = land.river.state;
    // When years fly by, the averaged snow would grey the whole valley; a long exposure keeps
    // only the lasting cover.
    const fold = smooth01(this.yearRate * 0.6);
    const snow = clamp01(look.snow * (1 - 0.7 * fold) + weather.snow * 0.3);
    t.uSnow.value = snow;
    t.uWaterY.value = water.level;
    t.uWetBand.value = 0.25 + water.rough * 0.6 + weather.rain * 0.5;
    const wind = b.wind * (1 + weather.rain * 0.8) * (1 + this.fxHub.quake);
    land.plants.update(dt, this.time.year, wind, { ...look, snow }, this.climate.arid);
    land.river.update(dt);
    const u = land.river.uniforms;
    const atm = this.atmosphere;
    (u['uSunDir']!.value as Vector3).copy(atm.lightDir);
    // No sharp glitter from a sun that the time-lapse has smeared across the sky.
    (u['uSunLight']!.value as Color).copy(atm.sunColor).multiplyScalar(atm.sun.intensity * (atm.lightDir.y > 0 ? 1 : 0) * (0.15 + 0.85 * atm.disc));
    (u['uBodyLight']!.value as Color).copy(atm.sunColor).multiplyScalar(atm.sun.intensity * Math.max(atm.lightDir.y, 0) * 0.45).add(atm.zenith.clone().multiplyScalar(1.1));
    (u['uZenith']!.value as Color).copy(atm.zenith);
    (u['uHorizon']!.value as Color).copy(atm.horizon);
    u['uDaylight']!.value = atm.daylight;
    const reflect = this.view.preset.reflection > 0;
    u['uReflOn']!.value = reflect ? 1 : 0;
    u['uReflection']!.value = reflect ? this.reflection.target.texture : null;
    land.birds.update(dt);
    land.driftwood.update(dt);
  }

  private refreshEnvironment(): void {
    const tex = this.sky.refreshEnvironment();
    this.scene.environment = tex;
    // Skylight a little under the sky's own brightness: at full strength it fills the shadows
    // until a clear afternoon looks overcast.
    this.scene.environmentIntensity = ENV_INTENSITY;
    this.atmosphere.hemiScale = tex ? 0 : 1;
  }

  render(): void {
    const start = performance.now();
    const r = this.view.renderer;
    r.info.reset();
    if (this.atmosphere.envStale()) {
      this.atmosphere.markEnvFresh();
      this.refreshEnvironment();
    }
    r.shadowMap.needsUpdate = true;
    const land = this.land;
    if (land && this.view.preset.reflection > 0) {
      const hide: Object3D[] = [land.river.mesh, this.particles.points, this.precip.rain, this.precip.snow];
      this.reflection.render(r, this.scene, this.rig.camera, land.river.state.level + land.river.state.heap * 0.5, hide);
      (land.river.uniforms['uTexMatrix']!.value as { copy(m: unknown): void }).copy(this.reflection.textureMatrix);
    }
    this.view.render(this.lastDt);
    this.cpuMs = performance.now() - start;
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.view.resize(width, height, pixelRatio);
    this.rig.setAspect(Math.max(1, width) / Math.max(1, height));
    this.resizeTargets();
  }

  private resizeTargets(): void {
    const size = this.view.bufferSize();
    this.reflection.setSize(size.width, size.height);
  }

  async capture(width: number, height: number): Promise<Blob | null> {
    try {
      this.render();
      const src = this.view.renderer.domElement;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      // Cover-fit crop, drawn in the same task as the render so the drawing buffer is intact.
      const scale = Math.max(canvas.width / src.width, canvas.height / src.height);
      const sw = canvas.width / scale;
      const sh = canvas.height / scale;
      ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
    } catch (err) {
      log.warn('world', 'capture failed', err);
      return null;
    }
  }

  stats(): WorldStats {
    const info = this.view.renderer.info.render;
    return { calls: info.calls, triangles: info.triangles, cpuMs: this.cpuMs };
  }

  dispose(): void {
    this.loadToken++;
    this.fxHub.dispose();
    if (this.land) {
      this.scene.remove(this.land.group);
      this.land.dispose();
      this.land = null;
    }
    this.particles.dispose();
    this.precip.dispose();
    this.reflection.dispose();
    this.sky.dispose();
    this.atmosphere.sun.shadow.map?.dispose();
    this.shared.noise.dispose();
    this.shared.waves.dispose();
    this.shared.atlas?.dispose();
    for (const m of new Set(this.models.values())) {
      m.geometry.dispose();
      m.leafMap?.dispose();
    }
    this.view.dispose();
  }
}

function smooth01(x: number): number {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}

export function createWorld(canvas: HTMLCanvasElement, bus: Bus, options: { quality: QualityId }): World {
  return new WorldImpl(canvas, bus, options.quality);
}

export type { CameraRig };
