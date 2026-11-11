/**
 * The game module's own types: what createGame needs, the phases of the flow and the context
 * they share. The flow is a small explicit state machine (see flow.ts); every phase is one file
 * under phases/ and the Session (session.ts) is the single owner of the game's state.
 */
import type { Bus } from '../core/bus';
import type { AudioApi, BridgeViewApi, ContentApi, SaveStore, SimApi, UiApi, UiIntent, WorldApi, WorldTime } from '../core/contracts';
import type { CollapseInfo, LevelId, Vec2 } from '../core/types';

/** The bridge view as the game uses it: the contract plus the two extras the view module offers. */
export interface GameBridge extends BridgeViewApi {
  setTime(time: WorldTime): void;
  warmPhysics(): Promise<void>;
  /** Wipe moss off the upstream face (the epilogue); returns how clean `probe` now is, 0..1. */
  wipe(at: Vec2, radius: number, probe?: Vec2): number;
  /** A thick coat of moss and lichen over the upstream face (0..1), for the epilogue to wipe. */
  overgrow(amount: number): void;
}

/** The audio module's extension: the makam colour of the region. */
export interface GameAudio extends AudioApi {
  setRegion(levelIndex: number): void;
}

export interface GameDeps {
  readonly sim: SimApi;
  readonly content: ContentApi;
  readonly world: WorldApi;
  readonly bridge: GameBridge;
  readonly audio: GameAudio;
  readonly ui: UiApi;
  readonly bus: Bus;
  readonly store: SaveStore;
  /** CSS size of the picture, for gestures measured in screen widths. */
  viewport(): { width: number; height: number };
  /** The operating system asks for less motion. */
  prefersReducedMotion(): boolean;
  /** A device that should start on the low preset when quality is automatic. */
  readonly lowEnd: boolean;
  /** Black over the picture (0 clear, 1 black), faded over `seconds`: the opening and the cuts. */
  curtain(opacity: number, seconds: number): void;
  /** The scene's WebGL canvas, read right after each render for the shared time-lapse. */
  readonly canvas: HTMLCanvasElement | null;
}

export type PhaseId = 'boot' | 'title' | 'arrive' | 'design' | 'build' | 'strike' | 'time' | 'fall' | 'result' | 'epilogue';

/** What the player is playing: the family's rivers, or one of the modes beside them. */
export type Mode = 'story' | 'daily' | 'millennium' | 'epilogue';

/** Where the flow goes next, with what that phase needs. */
export type Step =
  | { readonly to: 'title' }
  | { readonly to: 'arrive'; readonly level: LevelId }
  | { readonly to: 'design' }
  | { readonly to: 'build' }
  | { readonly to: 'strike' }
  | { readonly to: 'time' }
  | { readonly to: 'fall'; readonly info: CollapseInfo; readonly years: number | null }
  | { readonly to: 'result' }
  | { readonly to: 'epilogue' };

export interface Phase {
  readonly id: PhaseId;
  enter(): void;
  exit(): void;
  /** `dt` is game time (paused and slowed by the clock). */
  update(dt: number): void;
  /** Returns true when the intent was used. */
  intent(intent: UiIntent): boolean;
  /** A few facts for the harness. */
  describe(): Record<string, unknown>;
}
