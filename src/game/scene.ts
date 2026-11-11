/**
 * What the game tells the world, the bridge and the sound every frame: the calendar and the sun,
 * the river's water and the ambience. Phases change these fields; push() hands them on.
 */
import type { AmbienceState, WaterState, WorldTime } from '../core/contracts';
import { clamp01, damp, smoothstep } from '../core/math';
import type { LevelDef } from '../core/types';
import type { GameDeps } from './types';

/** The river at rest at this site: its usual speed and colour, no flood. */
export function calmWater(level: LevelDef | null): WaterState {
  const slope = level?.site.slope ?? 0.005;
  return { level: 0, speed: 0.35 + Math.min(1.2, slope * 60), turbidity: 0.08, rough: 0.06 + Math.min(0.2, slope * 8), heap: 0 };
}

/** 0 by day, 1 at night, with dusk and dawn between. */
export function nightOf(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  return 1 - smoothstep(5, 7.5, h) * (1 - smoothstep(18.5, 21, h));
}

export class SceneState {
  time: WorldTime = { year: 1147, season: 0.33, hour: 16.6, lapse: 0 };
  water: WaterState = calmWater(null);
  /** 0..1 birdsong the moment allows (0 right after the centering falls, 1 at peace). */
  birds = 1;
  /** Rain the moment asks for, 0..1 (a flood brings it). */
  rain = 0;
  private level: LevelDef | null = null;
  private river = 0.3;
  private soundClock = 0;
  private waterDirty = true;

  setLevel(level: LevelDef): void {
    this.level = level;
    this.time = { year: level.year, season: 0.33, hour: 16.6, lapse: 0 };
    this.setWater(calmWater(level));
  }

  setWater(water: WaterState): void {
    this.water = water;
    this.waterDirty = true;
  }

  /** Back to the river at rest, smoothly enough that a flood drains rather than vanishes. */
  calm(): void {
    this.setWater(calmWater(this.level));
  }

  push(deps: GameDeps, dt: number): void {
    deps.world.setTime(this.time);
    deps.bridge.setTime(this.time);
    if (this.waterDirty) {
      deps.world.setWater(this.water);
      this.waterDirty = false;
    }
    const pose = deps.world.rig.pose;
    deps.audio.setListener(pose.target.x, pose.distance);
    // The river's loudness follows the water: a murmur at rest, a roar in flood.
    const stage100 = this.level?.site.flood.stage100 ?? 2;
    const flood = clamp01(this.water.level / Math.max(0.5, stage100));
    this.river = damp(this.river, 0.28 + 0.72 * flood, 3, dt);
    this.soundClock -= dt;
    if (this.soundClock > 0) return;
    this.soundClock = 0.2;
    const env = this.level?.env;
    const winter = clamp01(Math.cos((this.time.season - 0.04) * Math.PI * 2));
    const ambience: Partial<AmbienceState> = {
      river: this.river,
      wind: clamp01(0.15 + 0.35 * winter * (env?.winter ?? 0.4) + 0.2 * flood),
      birds: this.birds,
      rain: clamp01(Math.max(this.rain, flood * 0.6)),
      night: nightOf(this.time.hour) * (1 - this.time.lapse),
      season: this.time.season,
      lapse: this.time.lapse,
    };
    deps.audio.setAmbience(ambience);
  }
}
