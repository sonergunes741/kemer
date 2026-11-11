/**
 * Sun, sky, haze and ambient driven by the time of day, the season, the climate and the
 * time-lapse. Everything is coloured from one Preetham state so the ground agrees with the sky.
 *
 * In time-lapse (lapse -> 1) the sun disc gives way to the streak of its daily circle, the light
 * becomes the day's average from a steady direction, shadows soften, and the band of the streak
 * widens to cover the seasons the clock has just swept through.
 */
import { Color, DirectionalLight, Fog, HemisphereLight, Object3D, Vector3, type Camera } from 'three';
import { clamp01, damp, lerp, smoothstep } from '../../core/math';
import type { WorldTime } from '../../core/contracts';
import type { BiomeDef } from './biomes';
import type { SkyDome } from './sky';
import { extinction, skyRadiance, skyState, type Rgb, type SkyParams } from './skyModel';
import { celestialPole, dayAverage, declination, sunDirection, type Dir3 } from './solar';

export interface Weather {
  rain: number;
  snow: number;
}

/** Sun light intensity at noon in clear air (three.js physically based units, tuned with AgX). */
const SUN_INTENSITY = 6.0;
/**
 * Scale from the Preetham sky's units to the scene's: keeps the sky about as bright as sunlit
 * ground, as it is outdoors, so the image-based ambient does not wash out the shadows.
 */
const SKY_EXPOSURE = 0.4;
const WHITE = new Color(1, 1, 1);
/** The moment the light is directed for (the game's spring afternoon) and where its sun stands: 62 degrees round from the upstream face's normal towards +X. */
const RAKE_SEASON = 0.33;
const RAKE_HOUR = 16.6;
const RAKE_AZIMUTH = (62 * Math.PI) / 180;

export class Atmosphere {
  readonly sun = new DirectionalLight(0xffffff, SUN_INTENSITY);
  readonly hemi = new HemisphereLight(0x8fa6c0, 0x5a5040, 0.25);
  readonly fog = new Fog(0x9aa6b0, 0.001, 0.01);
  /** Where the light comes from (unit, towards the light). */
  readonly lightDir = new Vector3(0, 1, 0);
  /** Linear colours other shaders read (water specular, sky reflection on low). */
  readonly sunColor = new Color();
  readonly zenith = new Color();
  readonly horizon = new Color();
  /** 0 day .. 1 night, after the time-lapse is taken into account. */
  night = 0;
  /** 1 while the sun is a disc, 0 once the time-lapse has drawn it out into a streak. */
  disc = 1;
  /** Overall daylight level 0..1 (particles and fake lighting scale with it). */
  daylight = 1;
  /** The hemisphere fill only stands in for the environment map when there is none. */
  hemiScale = 1;

  private latitude = 39;
  private compass = 0;
  private biome: BiomeDef | null = null;
  private params: SkyParams = { turbidity: 3, rayleigh: 1.5, mie: 0.005, mieG: 0.8 };
  private decLo = 0;
  private decHi = 0;
  private bandReady = false;
  private cloudX = 0;
  private cloudZ = 0;
  private hazeDensity = 0.001;
  private lastEnvDir = new Vector3(0, -1, 0);
  private lastEnvCloud = -1;
  private lastEnvNight = -1;
  private sinceEnv = 10;
  private envDirty = true;
  private lightParams: SkyParams = { turbidity: 3, rayleigh: 1, mie: 0.005, mieG: 0.8 };
  private readonly zenithRaw = new Color();
  private readonly fogRaw = new Color();
  private readonly tint = new Color();
  private readonly ground = new Color();
  private readonly tmp: Dir3 = { x: 0, y: 0, z: 0 };
  private readonly tmp2: Dir3 = { x: 0, y: 0, z: 0 };
  private readonly rgb: Rgb = [0, 0, 0];
  private readonly forward = new Vector3();

  constructor(private readonly sky: SkyDome) {
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.sun.target = new Object3D();
  }

  /**
   * `compass` is a small per-site turn on top of the art direction: every valley is turned so the
   * afternoon sun of the game's working hours comes from the right and a little in front of the
   * upstream face, low enough to rake across it (the relief of every stone, the parapets and the
   * trees then throw visible shadows), while the morning sun still rises over the left bank.
   */
  setSite(latitude: number, compass: number, biome: BiomeDef): void {
    this.latitude = latitude;
    const ref = sunDirection(latitude, declination(RAKE_SEASON), RAKE_HOUR, 0, this.tmp);
    this.compass = RAKE_AZIMUTH - Math.atan2(ref.x, ref.z) + compass;
    this.biome = biome;
    this.params = { turbidity: biome.sky.turbidity, rayleigh: biome.sky.rayleigh, mie: biome.sky.mie, mieG: 0.78 };
    this.lightParams = { turbidity: biome.sky.turbidity, rayleigh: 1, mie: biome.sky.mie * 0.6, mieG: 0.78 };
    this.bandReady = false;
    this.sinceEnv = 10;
  }

  /** Fit the shadow camera around a sphere (stable as the sun moves: no swimming edges). */
  fitShadow(center: Vector3, radius: number, mapSize: number): void {
    const cam = this.sun.shadow.camera;
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.near = 0.5;
    cam.far = radius * 4;
    cam.updateProjectionMatrix();
    this.sun.target.position.copy(center);
    this.sun.target.updateMatrixWorld();
    this.shadowCenter.copy(center);
    this.shadowRadius = radius;
    if (this.sun.shadow.mapSize.x !== mapSize) {
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }
  private readonly shadowCenter = new Vector3();
  private shadowRadius = 40;

  update(time: WorldTime, dt: number, weather: Weather, camera: Camera): void {
    const biome = this.biome;
    if (!biome) return;
    const lapse = clamp01(time.lapse);
    const u = this.sky.uniforms;

    // The streak's band: it widens to hold every declination swept through in the last moments.
    const d = declination(time.season);
    if (!this.bandReady) {
      this.decLo = d;
      this.decHi = d;
      this.bandReady = true;
    }
    this.decLo = Math.min(damp(this.decLo, d, 2.2, dt), d);
    this.decHi = Math.max(damp(this.decHi, d, 2.2, dt), d);
    const dMid = (this.decLo + this.decHi) / 2;

    const real = sunDirection(this.latitude, d, time.hour, this.compass, this.tmp);
    const avg = dayAverage(this.latitude, dMid, this.compass, this.tmp2);
    const k = smoothstep(0.05, 0.85, lapse);
    const dir = this.lightDir.set(lerp(real.x, avg.dir.x, k), lerp(real.y, avg.dir.y, k), lerp(real.z, avg.dir.z, k)).normalize();

    const state = skyState(this.params, { x: dir.x, y: dir.y, z: dir.z });
    u.uSunDir.value.copy(dir);
    u.uBetaR.value.set(state.betaR[0], state.betaR[1], state.betaR[2]);
    u.uBetaM.value.set(state.betaM[0], state.betaM[1], state.betaM[2]);
    u.uSunE.value = state.sunE;
    u.uSunfade.value = state.sunfade;
    u.uMieG.value = this.params.mieG;
    this.disc = 1 - smoothstep(0.15, 0.55, lapse);
    u.uDisc.value = this.disc;
    u.uStreak.value = smoothstep(0.25, 0.8, lapse);
    const pole = celestialPole(this.latitude, this.compass, this.tmp);
    u.uPole.value.set(pole.x, pole.y, pole.z);
    u.uDecBand.value.set(this.decLo, this.decHi);
    u.uStreakTint.value.setRGB(5, 4.7, 4.2);

    // Overcast: weather thickens the cloud and dims the direct sun.
    const overcast = clamp01(weather.rain * 0.9 + weather.snow * 0.7);
    const cover = clamp01(biome.clouds + overcast * 0.6);
    u.uCloudCover.value = cover;
    u.uCloudAlpha.value = lerp(0.85, 0.4, lapse) * (0.75 + overcast * 0.25);
    const wind = 0.004 * (1 + lapse * 30);
    this.cloudX += dt * wind;
    this.cloudZ += dt * wind * 0.4;
    u.uCloudOffset.value.set(this.cloudX % 1000, this.cloudZ % 1000);

    // Night only exists when the clock runs at the speed of days.
    const sunUp = smoothstep(-0.12, 0.06, dir.y);
    this.night = (1 - sunUp) * (1 - k);
    u.uNight.value = this.night;

    // Direct light: the sun seen through the air (a plain Rayleigh sky, so a high sun stays
    // nearly white and a low one turns gold), dimmed with the air mass; a faint moon by night.
    const lightState = skyState(this.lightParams, { x: dir.x, y: dir.y, z: dir.z });
    extinction(lightState, Math.max(dir.y, 0.02), this.rgb);
    const peak = Math.max(this.rgb[0], this.rgb[1], this.rgb[2], 1e-4);
    const strength = Math.pow(this.rgb[0] * 0.3 + this.rgb[1] * 0.59 + this.rgb[2] * 0.11, 0.6);
    this.sunColor.setRGB(this.rgb[0] / peak, this.rgb[1] / peak, this.rgb[2] / peak).lerp(WHITE, 0.1);
    // The day's average sun is weaker, but only partly: dimmed fully the valley turns to milk.
    const direct = SUN_INTENSITY * strength * lerp(1, 0.55 + 0.45 * Math.min(1, avg.strength * 1.15), k) * (1 - overcast * 0.75);
    const dayLight = smoothstep(-0.03, 0.08, dir.y);
    u.uExposure.value = SKY_EXPOSURE;
    if (dayLight > 0.001) {
      this.sun.color.copy(this.sunColor);
      this.sun.intensity = direct * dayLight;
      this.sun.position.copy(this.shadowCenter).addScaledVector(dir, this.shadowRadius * 2);
    } else {
      this.sun.color.setRGB(0.55, 0.65, 0.9);
      this.sun.intensity = 0.12;
      this.sun.position.copy(this.shadowCenter).addScaledVector(this.forward.set(-dir.x, Math.abs(dir.y) + 0.5, -dir.z).normalize(), this.shadowRadius * 2);
    }
    this.sun.shadow.intensity = lerp(1, 0.55, k) * (1 - overcast * 0.6);
    this.sun.shadow.radius = lerp(3, 9, k);

    // Sky colours for the haze, the clouds and the water. The sky shader works before its
    // exposure; everything the scene reads (zenith, horizon, fog) is after it.
    skyRadiance(state, this.params, { x: 0, y: 1, z: 0 }, this.rgb);
    this.zenithRaw.setRGB(this.rgb[0], this.rgb[1], this.rgb[2]);
    this.zenith.copy(this.zenithRaw).multiplyScalar(SKY_EXPOSURE);
    camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
    skyRadiance(state, this.params, { x: this.forward.x * 0.999, y: 0.045, z: this.forward.z * 0.999 }, this.rgb);
    const fogCol = this.fogRaw.setRGB(this.rgb[0], this.rgb[1], this.rgb[2]);
    const lum = fogCol.r * 0.3 + fogCol.g * 0.55 + fogCol.b * 0.15;
    fogCol.lerp(this.tint.set(biome.haze.tint).multiplyScalar(lum * 1.1), biome.haze.tintMix + overcast * 0.3);
    fogCol.lerp(this.tint.setRGB(lum, lum, lum).multiplyScalar(0.85), overcast * 0.5);
    fogCol.r = Math.max(fogCol.r, (0.006 / SKY_EXPOSURE) * this.night);
    fogCol.g = Math.max(fogCol.g, (0.009 / SKY_EXPOSURE) * this.night);
    fogCol.b = Math.max(fogCol.b, (0.02 / SKY_EXPOSURE) * this.night);
    u.uFogColor.value.copy(fogCol);
    this.fog.color.copy(fogCol).multiplyScalar(SKY_EXPOSURE);
    this.horizon.copy(this.fog.color);
    u.uHorizonHaze.value = clamp01(0.55 + overcast * 0.35);

    const targetHaze = biome.haze.density * (1 + overcast * 1.6 + weather.snow * 0.8);
    this.hazeDensity = damp(this.hazeDensity, targetHaze, 1.5, dt);
    // Fog parameters are re-purposed: near = density at the water, far = height falloff (see haze.ts).
    this.fog.near = this.hazeDensity;
    this.fog.far = biome.haze.falloff;

    // Clouds in the sky shader's own units (before exposure): sunlit tops, sky-lit undersides.
    u.uCloudSun.value.copy(this.sunColor).multiplyScalar((this.sun.intensity / SUN_INTENSITY) * 2.6 * dayLight);
    u.uCloudShade.value.copy(this.zenithRaw).multiplyScalar(0.6).addScalar(0.12 * dayLight);

    this.daylight = clamp01(dayLight * (1 - overcast * 0.5) + 0.04);
    // Ground seen from below in the environment map (sky units), and the hemisphere fill.
    const ground = this.ground.set(biome.grass.summer).lerp(this.tint.set(biome.soil[0]), 0.4);
    const groundLight = (this.sun.intensity * Math.max(dir.y, 0.05) + this.zenith.g * 2) / SKY_EXPOSURE;
    u.uGround.value.copy(ground).multiplyScalar(groundLight * 0.9);
    this.hemi.color.copy(this.zenith);
    this.hemi.groundColor.copy(ground).multiplyScalar(this.sun.intensity * Math.max(dir.y, 0) * 0.5);
    this.hemi.intensity = (0.25 * this.daylight + 0.02) * this.hemiScale;

    this.sinceEnv += dt;
  }

  /** True when the environment map should be rebuilt (the light moved enough, clouds or dusk changed). */
  envStale(): boolean {
    const u = this.sky.uniforms;
    const moved = this.lastEnvDir.dot(this.lightDir) < Math.cos(0.025);
    const cloud = Math.abs(u.uCloudCover.value - this.lastEnvCloud) > 0.05;
    const dusk = Math.abs(this.night - this.lastEnvNight) > 0.04;
    return this.envDirty || ((moved || cloud || dusk) && this.sinceEnv > 0.2);
  }

  /** Forces a rebuild on the next frame (a new site or sky). */
  invalidateEnv(): void {
    this.envDirty = true;
  }

  markEnvFresh(): void {
    this.lastEnvDir.copy(this.lightDir);
    this.lastEnvCloud = this.sky.uniforms.uCloudCover.value;
    this.lastEnvNight = this.night;
    this.sinceEnv = 0;
    this.envDirty = false;
  }
}
