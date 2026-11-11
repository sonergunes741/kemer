/**
 * Contracts between Kemer's modules. Owned by the lead; modules implement these interfaces and
 * talk to each other only through them (and through the event bus in ./bus).
 *
 *   sim      pure engineering, no DOM, no three.js        -> SimApi
 *   world    renderer, landscape, water, sky, particles   -> WorldApi
 *   bridge   the bridge itself: stones, centering, traffic -> BridgeViewApi
 *   audio    synthesized sound and music                  -> AudioApi
 *   ui       DOM/SVG interface                            -> UiApi
 *   content  levels, story, generated rivers              -> ContentApi
 *   game     flow, tutorial, camera direction, saves      (uses all of the above)
 */
import type { Object3D, PerspectiveCamera, Scene } from 'three';
import type {
  ActorKind,
  BridgeDesign,
  BridgeGeometry,
  BridgeState,
  Capacities,
  ChronicleEvent,
  CollapseInfo,
  DesignIssue,
  FamilyMark,
  Hinge,
  Insight,
  Lang,
  LevelDef,
  LevelId,
  LevelRecord,
  LocalText,
  QualityId,
  RepairQuote,
  RunSummary,
  SaveData,
  Settings,
  SoilId,
  SoilMaterial,
  StoneId,
  StoneMaterial,
  StrikeResult,
  ToolId,
  TrafficEra,
  Vec2,
  Vec3,
} from './types';

/* ------------------------------------------------------------------------------------------ */
/* Platform                                                                                    */
/* ------------------------------------------------------------------------------------------ */

export interface KeyValueStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/* ------------------------------------------------------------------------------------------ */
/* Simulation                                                                                  */
/* ------------------------------------------------------------------------------------------ */

export interface UpcomingEvent {
  readonly year: number;
  readonly kind: 'flood' | 'quake' | 'load';
  /** 0..1: how much the director should slow down for it. The outcome is never revealed. */
  readonly drama: number;
}

/** One bridge living through the centuries. Deterministic: the same level and design give the same run. */
export interface ChronicleRun {
  readonly level: LevelDef;
  readonly design: BridgeDesign;
  readonly geometry: BridgeGeometry;
  /** Current year (fractional). Starts at level.year. */
  readonly year: number;
  /** Live condition of the bridge; mutated by advance() and repair(). Callers only read it. */
  readonly state: BridgeState;
  /** True once the bridge has fallen or the end year is reached. */
  readonly ended: boolean;
  /** Notable events after the current year, ascending. */
  upcoming(limit?: number): readonly UpcomingEvent[];
  /**
   * Run the simulation up to `year` and return what happened on the way, in order. Stops at a
   * collapse (the last event is then `collapse`) or at the level's end year (`end`).
   * Cheap enough to call every frame with small steps.
   */
  advance(year: number): ChronicleEvent[];
  quote(): RepairQuote;
  /** Repoint the joints, clear the growth and protect the pier feet. Returns false if nothing to do. */
  repair(): boolean;
  summary(): RunSummary;
}

export interface SimApi {
  readonly stones: Readonly<Record<StoneId, StoneMaterial>>;
  readonly soils: Readonly<Record<SoilId, SoilMaterial>>;
  /** A copy of the design clamped to the level's limits, with spans and piers made consistent. Never throws. */
  normalize(level: LevelDef, design: BridgeDesign): BridgeDesign;
  validate(level: LevelDef, design: BridgeDesign): DesignIssue[];
  geometry(level: LevelDef, design: BridgeDesign): BridgeGeometry;
  /** Fast (well under 4 ms for a ten-span bridge): called on every pointer move while a handle is dragged. */
  insight(level: LevelDef, design: BridgeDesign): Insight;
  /** Slower (tens of ms): called when a handle is released. */
  capacities(level: LevelDef, design: BridgeDesign): Capacities;
  strike(level: LevelDef, design: BridgeDesign): StrikeResult;
  run(level: LevelDef, design: BridgeDesign): ChronicleRun;
  /** Natural stage (m above normal water) of the flood with the given return period in years. */
  floodStage(level: LevelDef, returnPeriod: number): number;
  /** Year and natural stage of the greatest flood between the build year and the end year. */
  greatestFlood(level: LevelDef): { year: number; stage: number };
}

/* ------------------------------------------------------------------------------------------ */
/* World (renderer, landscape, water, sky, particles, camera)                                  */
/* ------------------------------------------------------------------------------------------ */

export interface WorldTime {
  /** Calendar year, fractional. Drives the age of trees and the look of the era. */
  year: number;
  /** Position in the year, 0..1 (0 = 1 January). */
  season: number;
  /** Local solar time, 0..24. */
  hour: number;
  /**
   * 0 = ordinary time: one sun, real shadows. 1 = full time-lapse: the sun is drawn as the streak
   * of its daily path, light is the day's average, seasons blend smoothly.
   */
  lapse: number;
}

export interface WaterState {
  /** Water surface at the bridge, m above normal. */
  level: number;
  /** Surface speed, m/s. */
  speed: number;
  /** 0 = the site's clear-day colour, 1 = full flood: opaque, silt-laden. */
  turbidity: number;
  /** 0..1 surface roughness: standing waves, foam. */
  rough: number;
  /** Extra height of the water on the upstream side of the bridge (afflux), metres. */
  heap: number;
}

export interface CameraPose {
  /** Point the camera looks at. */
  target: Vec3;
  /** Distance from the target, metres. */
  distance: number;
  /** Rotation about the vertical axis, radians. 0 looks straight down the river at the upstream face (pure elevation). */
  yaw: number;
  /** Elevation angle, radians, 0 = level. */
  pitch: number;
  /** Vertical field of view, degrees. Small values with a large distance give the flat elevation view for design. */
  fov: number;
}

export interface CameraRig {
  readonly camera: PerspectiveCamera;
  /** Jump to a pose. */
  set(pose: CameraPose): void;
  /** Glide to a pose; resolves on arrival (or when another move replaces it). */
  move(pose: CameraPose, seconds: number, ease?: 'in-out' | 'out' | 'linear'): Promise<void>;
  readonly pose: Readonly<CameraPose>;
  /** Player look-around offsets added on top of the directed pose (clamped by the rig). */
  nudge(dYaw: number, dPitch: number, dZoom: number): void;
  /** Let the look-around offsets drift back to zero. */
  recentre(): void;
  /** Trauma-based shake, 0..1; decays by itself. Ignored when reduced motion is on. */
  shake(amount: number): void;
  /** A pose that frames the whole bridge from the given angles. */
  frame(geometry: BridgeGeometry, yaw: number, pitch: number, fov: number, margin?: number): CameraPose;
}

export type DustKind = 'ring' | 'puff' | 'fall' | 'trail';

export interface FxApi {
  /** Stone dust. `ring` expands flat from a point (the keystone), `puff` bursts, `fall` sifts down. */
  dust(kind: DustKind, at: Vec3, size: number): void;
  /** Something hits the river. Size ~ metres across. */
  splash(at: Vec3, size: number): void;
  /** Wood chips, leaves, sparks of chisel dust. */
  chips(at: Vec3, count: number, kind: 'wood' | 'stone' | 'leaf'): void;
  /** Floating driftwood for floods: 0..1 density. */
  driftwood(amount: number): void;
  /** Rain 0..1 and snowfall 0..1 (the world also sets these itself from season and climate). */
  weather(rain: number, snow: number): void;
  /** Birds leave and return: 0 = none in the air, 1 = a full, calm sky. */
  birds(presence: number): void;
}

export interface WorldApi {
  readonly scene: Scene;
  readonly rig: CameraRig;
  readonly fx: FxApi;
  /** Build the landscape of a level. Disposes the previous one. */
  load(level: LevelDef): Promise<void>;
  /** Compile shaders and upload textures so the first frame does not stall. */
  warmUp(): Promise<void>;
  setQuality(quality: QualityId): void;
  setReducedMotion(on: boolean): void;
  setAmbientLife(on: boolean): void;
  setTime(time: WorldTime): void;
  setWater(water: WaterState): void;
  /** Where the bridge stands in the water (foam, wakes, shadows) and how deep the bed is scoured at each pier. */
  setBridge(geometry: BridgeGeometry | null, scour?: readonly number[]): void;
  /** Elevation point (on the plane of the upstream face) to CSS pixels inside the canvas. */
  toScreen(point: Vec2, out?: Vec2): Vec2;
  /** CSS pixel to the elevation plane; null if the ray misses. */
  fromScreen(x: number, y: number): Vec2 | null;
  /** Height of the ground, or of the river where that is higher, at world X, Z (-Infinity before a level loads): lets the director keep views clear of the banks. */
  groundAt(x: number, z: number): number;
  update(dt: number): void;
  render(): void;
  resize(width: number, height: number, pixelRatio: number): void;
  /** A still of the current frame without the UI, for the ledger and for sharing. */
  capture(width: number, height: number): Promise<Blob | null>;
  dispose(): void;
}

/* ------------------------------------------------------------------------------------------ */
/* Bridge view (stones, centering, ageing, collapse, traffic)                                  */
/* ------------------------------------------------------------------------------------------ */

export interface StoneRef {
  readonly span: number;
  readonly stone: number;
}

export interface BuildProgress {
  /** Stones laid and stones in total (keystones included). */
  readonly laid: number;
  readonly total: number;
  /** True when everything but the main keystone is in place. */
  readonly awaitingKeystone: boolean;
  readonly complete: boolean;
}

export interface BridgeViewApi {
  /** Root object; the game adds it to world.scene once. */
  readonly object: Object3D;

  /* -- design ---------------------------------------------------------------------------- */
  /** Show the light massing model of a design (called on every drag frame; must be cheap). */
  preview(level: LevelDef, geometry: BridgeGeometry): void;
  clear(): void;

  /* -- building -------------------------------------------------------------------------- */
  /** Prepare every stone (hidden) and the timber centering for this design. */
  beginBuild(level: LevelDef, geometry: BridgeGeometry): Promise<void>;
  /** Piers rise and the centering is raised on them. */
  raiseCentering(): Promise<void>;
  /**
   * While the player holds the build control the game calls this every frame with the time step;
   * stones are laid at a pace that quickens the longer it is held. Emits 'stone:land' for each.
   */
  lay(dt: number, holding: boolean): BuildProgress;
  readonly progress: BuildProgress;
  /** The main span's keystone hangs from the hoist and follows the pointer along the elevation x. */
  hangKeystone(): { span: number; seat: Vec3 };
  moveKeystone(x: number, y: number): void;
  /** Let it down. Resolves true when it seats (it only seats when held close above the gap). */
  dropKeystone(): Promise<boolean>;
  /** Spandrels, fill, parapets and paving complete by themselves after the keystone. */
  finish(): Promise<void>;
  /** The stone under a screen position, if any (for cutting the family mark). */
  pick(x: number, y: number): StoneRef | null;
  hover(stone: StoneRef | null): void;
  /** Cut the mark into a stone: three chisel taps, then the glyph shows. */
  carve(stone: StoneRef, mark: FamilyMark): Promise<void>;
  /** World positions of the wedges under the main span's centering. */
  wedges(): readonly Vec3[];
  /** Knock out one wedge. The last one frees the centering, which falls into the river. */
  strikeWedge(index: number): Promise<void>;
  /** The ring settles by `drops[span]` metres as the joints close (or the collapse starts instead). */
  settle(drops: readonly number[]): Promise<void>;

  /* -- the centuries --------------------------------------------------------------------- */
  /** Show a finished bridge at once (replays, the ledger, the epilogue). */
  showBuilt(level: LevelDef, geometry: BridgeGeometry, mark: { stone: StoneRef; mark: FamilyMark } | null): Promise<void>;
  /** Follow the simulation: weathering, moss, open joints, moved stones, pier protection. */
  apply(state: BridgeState): void;
  /** Shake loose dust and rattle the stones for an earthquake of this strength (fraction of capacity, 0..1+). */
  tremor(strength: number): void;
  /** Play the collapse. Resolves when the last stone has come to rest or sunk. */
  collapse(info: CollapseInfo): Promise<void>;
  /** Slow-motion factor the collapse wants right now (1 = real time); the game applies it to its clock. */
  readonly slowMotion: number;

  /* -- traffic --------------------------------------------------------------------------- */
  /** Everyday traffic for the era; density 0..1. */
  setTraffic(era: TrafficEra | null, density: number): void;
  /** One staged crossing (a caravan, a cannon). Resolves when it has left the bridge. */
  cross(actor: ActorKind, count: number, seconds: number): Promise<void>;

  setQuality(quality: QualityId): void;
  update(dt: number): void;
  dispose(): void;
}

/* ------------------------------------------------------------------------------------------ */
/* Audio                                                                                       */
/* ------------------------------------------------------------------------------------------ */

export type MusicMood =
  | 'none'
  | 'title' //    spare, open
  | 'survey' //   arriving at a river
  | 'design' //   quiet concentration
  | 'build' //    gentle momentum
  | 'hush' //     the breath before the centering is struck: near silence
  | 'relief' //   the arch stood
  | 'time' //     the centuries: wide, slow
  | 'peril' //    flood or earthquake
  | 'elegy' //    the bridge fell
  | 'legacy'; //  2026, the epilogue

export interface AmbienceState {
  /** 0..1 river loudness and weight (0.25 a calm stream, 1 a flood). */
  river: number;
  wind: number;
  /** 0..1 birdsong (0 just after the centering falls, back to 1 when calm returns). */
  birds: number;
  rain: number;
  /** 0 day .. 1 night (crickets instead of birds in the warm months). */
  night: number;
  /** 0..1 position in the year. */
  season: number;
  /** 0 = real time .. 1 = full time-lapse (ambience thins into a soft rush). */
  lapse: number;
}

export type SfxId =
  | 'ui-tap'
  | 'ui-hover'
  | 'ui-back'
  | 'ui-page'
  | 'handle-grab'
  | 'handle-tick'
  | 'handle-release'
  | 'handle-limit'
  | 'safe'
  | 'unsafe'
  | 'seal'
  | 'year-tick'
  | 'century'
  | 'timber'
  | 'crack'
  | 'rumble';

export interface AudioApi {
  /** Create/resume the audio context. Call from a user gesture. Safe to call repeatedly. */
  unlock(): Promise<void>;
  readonly unlocked: boolean;
  setVolumes(master: number, music: number, effects: number): void;
  setMuted(muted: boolean): void;
  setAmbience(state: Partial<AmbienceState>): void;
  setMood(mood: MusicMood, fadeSeconds?: number): void;
  /** A one-shot interface or game sound. Physical sounds (stones, splashes) come from bus events instead. */
  play(id: SfxId, options?: { gain?: number; pitch?: number; pan?: number }): void;
  /** Camera position along the bridge axis and distance, for panning and level of physical sounds. */
  setListener(x: number, distance: number): void;
  /** Pause everything (tab hidden, game paused) and resume. */
  suspend(): void;
  resume(): void;
  update(dt: number): void;
  dispose(): void;
}

/* ------------------------------------------------------------------------------------------ */
/* Design editing (shared between game and ui)                                                 */
/* ------------------------------------------------------------------------------------------ */

export type HandleKind =
  | 'crown' //      vertical: rise of a span
  | 'haunch' //     along the normal at the quarter point: fullness
  | 'ring' //       along the normal at the crown extrados: thickness
  | 'pier' //       horizontal: pier position
  | 'pier-side' //  horizontal: pier width
  | 'spring' //     vertical: springing level (at the left abutment)
  | 'cover' //      vertical: fill over the crown
  | 'foundation'; // vertical: foundation depth (below a pier)

export interface HandleId {
  readonly kind: HandleKind;
  /** Span or pier index the handle belongs to (0 for bridge-wide handles). */
  readonly index: number;
}

export interface HandleModel {
  readonly id: HandleId;
  /** Where the grip is drawn, elevation coordinates. */
  readonly at: Vec2;
  /** Unit direction the handle moves along. */
  readonly axis: Vec2;
  /** Current value in metres, shown beside the grip while it is held. */
  readonly value: number;
  /** True when the value sits at a limit in that direction (the grip shows a stop). */
  readonly atMin: boolean;
  readonly atMax: boolean;
}

export interface SpanModel {
  readonly intrados: readonly Vec2[];
  readonly extrados: readonly Vec2[];
  readonly thrustLine: readonly Vec2[];
  readonly hinges: readonly Hinge[];
  readonly gsf: number;
  /** Joints as short segments, for the drawn stonework of the draft. */
  readonly joints: readonly (readonly [Vec2, Vec2])[];
}

/** Everything the design screen draws, in elevation coordinates. Rebuilt by the game on every change. */
export interface DesignModel {
  readonly spans: readonly SpanModel[];
  readonly handles: readonly HandleModel[];
  readonly deck: readonly Vec2[];
  readonly piers: readonly { x: number; width: number; base: number; top: number }[];
  /** 0..: the gauge. 1 is the edge of collapse. */
  readonly safety: number;
  readonly stones: number;
  readonly parStones: number;
  readonly issues: readonly DesignIssue[];
  readonly tools: readonly ToolId[];
  readonly toggles: { cutwaters: boolean; reliefs: boolean; clamps: boolean; piles: boolean; linked: boolean };
  /** Flood marks to draw on the banks: natural stages, m above normal water. */
  readonly floodMarks: readonly { stage: number; label: LocalText }[];
  /** Filled in after a handle is released. */
  readonly capacities: Capacities | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly canBuild: boolean;
  /** Number of piers the player may still add. */
  readonly piersLeft: number;
}

/* ------------------------------------------------------------------------------------------ */
/* UI                                                                                          */
/* ------------------------------------------------------------------------------------------ */

export type ToggleKey = 'cutwaters' | 'reliefs' | 'clamps' | 'piles' | 'linked';

export type UiIntent =
  | { type: 'begin' } //                   first run: start playing
  | { type: 'continue' }
  | { type: 'open'; screen: 'ledger' | 'settings' | 'keys' | 'credits' | 'title' | 'daily' | 'millennium' }
  | { type: 'close' }
  | { type: 'level'; id: LevelId }
  | { type: 'mark'; mark: FamilyMark }
  | { type: 'handle'; id: HandleId; phase: 'grab' | 'drag' | 'release'; to: Vec2 }
  | { type: 'nudge'; id: HandleId; steps: number } //  keyboard: arrow keys on a focused handle
  | { type: 'add-pier'; x: number }
  | { type: 'remove-pier'; index: number }
  | { type: 'toggle'; key: ToggleKey; value: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' }
  | { type: 'primary'; phase: 'down' | 'up' } //  the one big action of the moment (build, lay, flow)
  | { type: 'canvas'; phase: 'down' | 'move' | 'up' | 'cancel'; x: number; y: number; id: number }
  | { type: 'look'; dYaw: number; dPitch: number; dZoom: number }
  | { type: 'speed'; value: 1 | 2 | 4 }
  | { type: 'pause'; on: boolean } //      the flow of time in the centuries (and resuming from the menu)
  | { type: 'menu' } //                    open the pause menu (menu button, Escape in play)
  | { type: 'repair' }
  | { type: 'skip' } //                    skip a vignette or a cinematic
  | { type: 'retry' }
  | { type: 'next' }
  | { type: 'share'; what: 'video' | 'image' | 'text' }
  | { type: 'choose'; index: number } //   pick one option of a choice card (the epilogue's repairs)
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'erase-save' };

/** One way to mend the bridge in the epilogue, already localised. */
export interface RestoreOption {
  readonly label: string;
  /** Its cost, e.g. "24 taş". */
  readonly detail: string;
  /** Already done: it can be read but not chosen again. */
  readonly spent: boolean;
}

/** The epilogue's repair card on the drawing board: the ways to mend, the one picked, the button. */
export interface RestoreCard {
  readonly options: readonly RestoreOption[];
  /** Index of the picked option, -1 for none. */
  readonly selected: number;
  /** Label of the primary control ("Onar · 24 taş"). */
  readonly action: string;
}

export interface CoachStep {
  /** Short instruction, already localised. */
  readonly text: string;
  /** What to point at. */
  readonly target:
    | { readonly kind: 'handle'; readonly id: HandleId }
    | { readonly kind: 'elevation'; readonly at: Vec2 }
    | { readonly kind: 'control'; readonly id: 'primary' | 'repair' | 'speed' | 'undo' | 'toggle-cutwaters' | 'toggle-reliefs' | 'toggle-clamps' | 'toggle-piles' | 'add-pier' }
    | { readonly kind: 'none' };
  /** A ghost hand shows this gesture at the target. */
  readonly gesture?: 'drag-up' | 'drag-down' | 'drag-out' | 'drag-side' | 'tap' | 'hold' | 'drag-arc';
}

export interface LedgerEntry {
  readonly level: LevelDef;
  readonly record: LevelRecord | null;
  readonly unlocked: boolean;
  /** Silhouette of the player's best bridge there, elevation polylines normalised by the UI. */
  readonly sketch: BridgeGeometry | null;
}

export type UiScreen =
  | { readonly id: 'none' }
  | { readonly id: 'title'; readonly firstRun: boolean; readonly canContinue: boolean; readonly postgame: boolean; /** The endless modes are open (the first river is passed); shown when not false. */ readonly modes?: boolean }
  | { readonly id: 'mark'; readonly current: FamilyMark | null } //   choose or draw the family mark
  | { readonly id: 'vignette'; readonly heading: string; readonly lines: readonly string[]; readonly year: number } // story card
  | { readonly id: 'ledger'; readonly entries: readonly LedgerEntry[]; readonly rank: string; readonly mark: FamilyMark | null; readonly epilogue: 'locked' | 'open' | 'done' }
  | { readonly id: 'survey'; readonly level: LevelDef } //             arriving: river, place, year
  | { readonly id: 'design'; readonly level: LevelDef; /** The epilogue: no handles, a card of repairs instead. */ readonly restore?: RestoreCard }
  | { readonly id: 'build'; readonly level: LevelDef; readonly step: 'centering' | 'stones' | 'keystone' | 'finish' | 'mark' | 'wedges' | 'settle' }
  | { readonly id: 'time'; readonly level: LevelDef }
  | { readonly id: 'collapse'; readonly level: LevelDef; readonly epitaph: string; readonly why: string; readonly hint: string; /** It fell after it had outlived its builder: the next river is open. */ readonly hasNext?: boolean }
  | { readonly id: 'result'; readonly level: LevelDef; readonly summary: RunSummary; readonly record: LevelRecord; readonly newSeals: readonly ('standing' | 'lean' | 'unrepaired' | 'masterwork')[]; readonly hasNext: boolean; readonly lines: readonly string[] }
  | { readonly id: 'settings'; readonly settings: Settings }
  | { readonly id: 'keys' }
  | { readonly id: 'credits' }
  | { readonly id: 'pause' };

export interface TimeHud {
  readonly year: number;
  readonly endYear: number;
  readonly builtYear: number;
  readonly safety: number;
  readonly speed: 1 | 2 | 4;
  readonly paused: boolean;
  readonly repair: RepairQuote;
  readonly stones: number;
  /** A short caption for what is happening ("1683 bahar seli"), or null. */
  readonly caption: string | null;
  /** 0..1 season position, for the small season mark beside the year. */
  readonly season: number;
}

export interface BuildHud {
  readonly laid: number;
  readonly total: number;
  /** Label of the primary control for this step, already localised. */
  readonly action: string;
  /** Whether the primary control is a hold (lay stones) or a tap. */
  readonly hold: boolean;
}

export interface UiApi {
  /** The game listens here for everything the player does. Returns an unsubscribe function. */
  onIntent(listener: (intent: UiIntent) => void): () => void;
  setScreen(screen: UiScreen): void;
  /** An overlay screen on top of the current one (settings, keys, pause, ledger from pause). null closes it. */
  setOverlay(screen: UiScreen | null): void;
  setDesign(model: DesignModel | null): void;
  setBuild(hud: BuildHud | null): void;
  setTime(hud: TimeHud | null): void;
  /** Teach one step in place; null clears it. */
  coach(step: CoachStep | null): void;
  /** A brief line that fades by itself (a milestone, a hint). */
  toast(text: string, tone?: 'plain' | 'good' | 'warn'): void;
  /** A large, quiet caption in the middle of the screen (a year, an epitaph). */
  caption(text: string | null, sub?: string | null): void;
  setLang(lang: Lang): void;
  /** Fade the whole interface out for a cinematic moment and back. */
  setVisible(visible: boolean): void;
  /** Called every frame so drawn overlays follow the camera. */
  frame(dt: number): void;
  dispose(): void;
}

/** What the UI needs from the renderer to draw over the scene. */
export interface Projector {
  toScreen(point: Vec2, out?: Vec2): Vec2;
  fromScreen(x: number, y: number): Vec2 | null;
}

/* ------------------------------------------------------------------------------------------ */
/* Content                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export interface StoryCard {
  readonly heading: LocalText;
  readonly lines: readonly LocalText[];
}

export interface LevelStory {
  /** Shown on arriving at the river. */
  readonly intro: StoryCard;
  /** Shown on the result screen: one for a bridge that outlasted its builder, one for a bridge that fell too soon. */
  readonly passed: readonly LocalText[];
  readonly failed: readonly LocalText[];
  /** A note about the real bridge that stands on this river. */
  readonly realBridge: LocalText;
  /** One line of advice per cause of collapse, in the family's voice. */
  readonly hints: Partial<Record<CollapseInfo['cause'], LocalText>>;
}

export interface ContentApi {
  /** The twelve rivers in order. */
  readonly levels: readonly LevelDef[];
  level(id: LevelId): LevelDef | null;
  story(id: LevelId): LevelStory | null;
  /** The epilogue is built from the player's own standing bridge. */
  epilogue(source: LevelDef, design: BridgeDesign): LevelDef;
  /** The river of the day for a local date (YYYY-MM-DD): the same for everyone. */
  daily(date: string): LevelDef;
  /** The thousand-year challenge: built in 1026. */
  millennium(): LevelDef;
  /** Rank title for a number of seals. */
  rank(seals: number): LocalText;
  /** Epitaph for a fallen bridge ("1683 bahar selinde yıkıldı."). */
  epitaph(info: CollapseInfo): LocalText;
  /** Plain explanation of why it fell, for the collapse screen. */
  explain(info: CollapseInfo): LocalText;
}

/* ------------------------------------------------------------------------------------------ */
/* Saves                                                                                       */
/* ------------------------------------------------------------------------------------------ */

export interface SaveStore {
  load(): SaveData;
  save(data: SaveData): void;
  erase(): void;
}
