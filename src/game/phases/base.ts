/**
 * What every phase shares: the context handed to it by the game, and a base class with game-time
 * timers. Phases are written as short async scripts; once a phase has ended, its pending waits
 * never resolve, so a script cut short simply stops instead of acting on a later phase.
 */
import type { SfxId, UiIntent } from '../../core/contracts';
import { log } from '../../core/log';
import type { LevelDef, LevelId } from '../../core/types';
import type { CameraDirector } from '../camera';
import type { SceneState } from '../scene';
import type { Session } from '../session';
import type { SettingsHub } from '../settings';
import type { Coach } from '../tutorial';
import type { GameDeps, Phase, PhaseId, Step } from '../types';

export interface GameContext {
  readonly deps: GameDeps;
  readonly session: Session;
  readonly scene: SceneState;
  readonly cam: CameraDirector;
  readonly coach: Coach;
  readonly settings: SettingsHub;
  go(step: Step): void;
  /** Write the save now (the game saves after every phase anyway). */
  persist(): void;
  sfx(id: SfxId, options?: { gain?: number; pitch?: number; pan?: number }): void;
  /** Load a river's landscape if the world does not already show it. */
  ensureWorld(level: LevelDef): Promise<void>;
  /** A level by id: the family's rivers, or one made at run time (the river of the day, the epilogue). */
  levelOf(id: LevelId): LevelDef | null;
}

interface Timer {
  left: number;
  done: () => void;
}

interface Condition {
  holds: () => boolean;
  done: () => void;
}

const never = new Promise<never>(() => undefined);

export abstract class PhaseBase implements Phase {
  abstract readonly id: PhaseId;
  protected alive = true;
  private timers: Timer[] = [];
  private conditions: Condition[] = [];

  constructor(protected readonly g: GameContext) {}

  enter(): void {
    this.script(() => this.run());
  }

  /** The phase's script; override. */
  protected async run(): Promise<void> {
    /* nothing by default */
  }

  exit(): void {
    this.alive = false;
    this.timers = [];
    this.conditions = [];
  }

  update(dt: number): void {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i]!;
      t.left -= dt;
      if (t.left <= 0) {
        this.timers.splice(i, 1);
        t.done();
      }
    }
    if (this.alive) this.tick(dt);
    for (let i = this.conditions.length - 1; i >= 0; i--) {
      const c = this.conditions[i]!;
      if (c.holds()) {
        this.conditions.splice(i, 1);
        c.done();
      }
    }
  }

  /** Wait until `holds` is true, checked once a frame after the phase's own tick. */
  protected until(holds: () => boolean): Promise<void> {
    if (!this.alive) return never;
    return new Promise((done) => this.conditions.push({ holds, done }));
  }

  protected tick(_dt: number): void {
    /* per-frame work; override */
  }

  intent(_intent: UiIntent): boolean {
    return false;
  }

  describe(): Record<string, unknown> {
    return {};
  }

  /** Game-time wait (stops with the pause menu, follows slow motion). */
  protected wait(seconds: number): Promise<void> {
    if (!this.alive) return never;
    return new Promise((done) => this.timers.push({ left: seconds, done }));
  }

  /** Wait for an outside promise, but only carry on if this phase is still the current one. */
  protected async keep<T>(p: Promise<T>): Promise<T> {
    const v = await p;
    if (!this.alive) return never;
    return v;
  }

  /** Run an async script; errors are reported once and never escape into the frame loop. */
  protected script(fn: () => Promise<void>): void {
    fn().catch((err: unknown) => log.error('game', `${this.id} script failed`, err));
  }
}
