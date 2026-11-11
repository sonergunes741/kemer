/**
 * The game: the flow from the title through each river (arrive, design, build, strike, time, the
 * fall or the result) and back, as a small explicit state machine. It owns the clock: the frame
 * loop hands it the real time step and gets back the game's (paused, slowed) one for the world
 * and the bridge. Everything the player does arrives here as a UiIntent.
 */
import type { SfxId, UiIntent, UiScreen } from '../core/contracts';
import { log } from '../core/log';
import type { LevelDef, LevelId, QualityId, SaveData } from '../core/types';
import { emptySave } from '../core/config';
import { CameraDirector } from './camera';
import { startMode } from './modes';
import { isUnlocked } from './progress';
import type { GameContext } from './phases/base';
import { createPhase } from './phases/create';
import { ledgerScreen } from './phases/title';
import { SceneState } from './scene';
import { Session } from './session';
import { SettingsHub } from './settings';
import { Sharer, type ShareReport } from './share';
import { Coach } from './tutorial';
import type { GameDeps, Mode, Phase, Step } from './types';

export interface Game {
  /** Advance one frame of real time; returns the game's time step for the bridge and the world. */
  update(realDt: number, unclampedDt?: number): number;
  /** The scene has just been drawn (its drawing buffer is still whole until this task ends). */
  afterRender(): void;
  start(): void;
  /** The tab was hidden or shown again. */
  setHidden(hidden: boolean): void;
  /** The picture's WebGL context was lost (true) or restored (false). */
  setContextLost(lost: boolean): void;
  /** Feed an intent as if the interface had sent it (the harness). */
  dispatch(intent: UiIntent): void;
  go(step: Step): void;
  jump(level: LevelId, to: 'arrive' | 'design' | 'build'): Promise<void>;
  readonly phase: Phase;
  readonly context: GameContext;
  readonly paused: boolean;
  /** The card open over the game (pause, ledger, settings), if any. */
  readonly overlay: UiScreen['id'] | null;
  /** The last thing shared, and whether a time-lapse is being recorded (the harness). */
  readonly shared: ShareReport | null;
  readonly recording: boolean;
  dispose(): void;
}

const GAMEPLAY = new Set(['design', 'build', 'strike', 'time', 'epilogue']);

/** Interface sounds for the plain button presses (physical sounds come from the bus). */
const TAP: Partial<Record<UiIntent['type'], SfxId>> = {
  begin: 'ui-tap',
  continue: 'ui-tap',
  open: 'ui-page',
  close: 'ui-back',
  level: 'ui-tap',
  menu: 'ui-page',
  next: 'ui-tap',
  retry: 'ui-tap',
  speed: 'ui-tap',
  toggle: 'ui-tap',
  undo: 'ui-back',
  redo: 'ui-tap',
  reset: 'ui-back',
  skip: 'ui-page',
  mark: 'ui-tap',
  choose: 'ui-tap',
};

/** The mode a level id belongs to. */
function modeOf(id: LevelId): Mode {
  return id === 'daily' || id === 'millennium' || id === 'epilogue' ? id : 'story';
}

/** Two levels on the same ground (the epilogue on its river, a day's river on its site) share one landscape. */
function sameLand(a: LevelDef | null, b: LevelDef): boolean {
  return !!a && (a === b || (a.site === b.site && a.env === b.env && a.stone === b.stone));
}

export function createGame(deps: GameDeps, save: SaveData, startQuality: QualityId): Game {
  const session = new Session(save);
  const scene = new SceneState();
  const persist = (): void => deps.store.save(session.save);
  const settings = new SettingsHub(deps, () => session.save, persist, startQuality);
  const cam = new CameraDirector(deps.world, () => settings.reducedMotion);
  const coach = new Coach(deps.ui, () => session.save, persist);
  const overlays: UiScreen[] = [];
  let hidden = false;
  let lost = false;
  let warmed = false;
  let loading: Promise<void> | null = null;
  let loadingLevel: LevelDef | null = null;

  const levelOf = (id: LevelId): LevelDef | null => session.madeLevel(id) ?? deps.content.level(id);

  const ctx: GameContext = {
    deps,
    session,
    scene,
    cam,
    coach,
    settings,
    go: (step) => go(step),
    persist,
    sfx(id, options) {
      deps.audio.play(id, options);
    },
    levelOf,
    async ensureWorld(level) {
      if (sameLand(session.loaded, level)) return;
      if (loading && sameLand(loadingLevel, level)) return loading;
      deps.bridge.clear();
      deps.world.setBridge(null);
      loadingLevel = level;
      loading = (async () => {
        await deps.world.load(level);
        session.loaded = level;
        if (!warmed) {
          warmed = true;
          await deps.world.warmUp();
        }
      })().finally(() => {
        loading = null;
        loadingLevel = null;
      });
      return loading;
    },
  };

  const sharer = new Sharer(ctx);
  let phase: Phase = createPhase({ to: 'title' }, ctx, true);

  /** Make `level` the one being played (its story, its mode, its region's music). */
  function take(level: LevelDef): void {
    session.level = level;
    session.story = deps.content.story(level.id);
    session.mode = modeOf(level.id);
    session.clearAttempt();
    deps.audio.setRegion(level.index);
  }

  function go(step: Step): void {
    sharer.cancel(true);
    try {
      phase.exit();
    } catch (err) {
      log.error('game', 'phase exit failed', err);
    }
    coach.clear();
    if (step.to === 'arrive') {
      const level = levelOf(step.level);
      if (level) take(level);
    }
    if (step.to === 'title') {
      session.clearAttempt();
      session.mode = 'story';
    }
    phase = createPhase(step, ctx, false);
    persist();
    phase.enter();
  }

  function pushOverlay(screen: UiScreen): void {
    overlays.push(screen);
    deps.ui.setOverlay(screen);
  }

  function popOverlay(): void {
    overlays.pop();
    deps.ui.setOverlay(overlays[overlays.length - 1] ?? null);
  }

  function closeOverlays(): void {
    overlays.length = 0;
    deps.ui.setOverlay(null);
  }

  settings.onLang = () => {
    coach.refresh();
    const top = overlays[overlays.length - 1];
    if (top?.id === 'ledger') {
      overlays[overlays.length - 1] = ledgerScreen(ctx);
      deps.ui.setOverlay(overlays[overlays.length - 1]!);
    }
  };

  /** Harness and dev: straight to a river's arrival, drawing board or building site. */
  async function jump(id: LevelId, to: 'arrive' | 'design' | 'build'): Promise<void> {
    const level = levelOf(id);
    if (!level) return;
    closeOverlays();
    if (to === 'arrive') return go({ to: 'arrive', level: id });
    take(level);
    scene.setLevel(level);
    deps.curtain(0, 0.3);
    await ctx.ensureWorld(level);
    go({ to });
  }

  function travel(id: LevelId): void {
    if (id === 'epilogue' || id === 'daily' || id === 'millennium') {
      closeOverlays();
      startMode(ctx, id);
      return;
    }
    // The ledger shows closed rivers too; only an open one may be travelled to.
    // (isUnlocked counts places in the list; LevelDef.index is the river's number, from one.)
    const at = deps.content.levels.findIndex((l) => l.id === id);
    if (at < 0 || !isUnlocked(deps.content.levels, session.save, at)) return;
    closeOverlays();
    go({ to: 'arrive', level: id });
  }

  function dispatch(intent: UiIntent): void {
    if (!deps.audio.unlocked && intent.type !== 'canvas' && intent.type !== 'look') void deps.audio.unlock();
    // While the time-lapse records, the interface is hidden and a skip stops it.
    if (sharer.recording) {
      if (intent.type === 'skip') sharer.cancel();
      return;
    }
    const tap = TAP[intent.type];
    if (tap) deps.audio.play(tap);
    const top = overlays[overlays.length - 1] ?? null;
    switch (intent.type) {
      case 'menu':
        if (!top && GAMEPLAY.has(phase.id)) pushOverlay({ id: 'pause' });
        return;
      case 'pause':
        if (top?.id === 'pause') {
          if (!intent.on) closeOverlays();
          return;
        }
        break;
      case 'close':
        if (top) {
          popOverlay();
          return;
        }
        break;
      case 'open':
        if (intent.screen === 'settings') pushOverlay({ id: 'settings', settings: { ...session.save.settings } });
        else if (intent.screen === 'keys') pushOverlay({ id: 'keys' });
        else if (intent.screen === 'credits') pushOverlay({ id: 'credits' });
        else if (intent.screen === 'title') {
          closeOverlays();
          go({ to: 'title' });
        } else if (intent.screen === 'daily' || intent.screen === 'millennium') {
          closeOverlays();
          startMode(ctx, intent.screen);
        } else if (intent.screen === 'ledger') {
          if (phase.id === 'title') break;
          pushOverlay(ledgerScreen(ctx));
        }
        return;
      case 'level':
        travel(intent.id);
        return;
      case 'settings':
        settings.apply(intent.patch, true);
        return;
      case 'erase-save':
        deps.store.erase();
        session.reset(emptySave(session.save.settings.lang));
        session.save.settings = { ...settings.current };
        persist();
        closeOverlays();
        go({ to: 'title' });
        return;
      case 'share':
        if (!top && phase.id === 'result') sharer.share(intent.what);
        return;
      default:
        break;
    }
    if (top && intent.type !== 'skip') return;
    if (phase.intent(intent)) return;
    if (intent.type === 'look') cam.look(intent.dYaw, intent.dPitch, intent.dZoom);
  }

  deps.ui.onIntent(dispatch);

  return {
    update(realDt, unclampedDt) {
      settings.monitor(unclampedDt ?? realDt);
      const menu = overlays.length > 0 && GAMEPLAY.has(phase.id);
      const scale = hidden || lost || menu ? 0 : deps.bridge.slowMotion;
      const dt = realDt * scale;
      try {
        phase.update(dt);
      } catch (err) {
        log.once(`game:update:${phase.id}`, 'game', 'phase update failed', err);
      }
      try {
        // The time-lapse stands still with the recorder while the tab is away, so no years are lost.
        if (!lost && !hidden) sharer.update(realDt);
      } catch (err) {
        log.once('game:share', 'game', 'time-lapse update failed', err);
      }
      cam.update(realDt);
      scene.push(deps, dt);
      return dt;
    },
    afterRender() {
      if (!lost) sharer.afterRender();
    },
    start() {
      settings.applyAll();
      deps.ui.setLang(session.save.settings.lang);
      phase.enter();
    },
    setHidden(on) {
      hidden = on;
      sharer.setHidden(on);
      if (on) deps.audio.suspend();
      else deps.audio.resume();
    },
    setContextLost(on) {
      lost = on;
      // A recording of a blank picture is worth nothing: stop it, the river comes back.
      if (on) sharer.cancel();
    },
    dispatch,
    go,
    jump,
    get phase() {
      return phase;
    },
    context: ctx,
    get paused() {
      return hidden || lost || (overlays.length > 0 && GAMEPLAY.has(phase.id));
    },
    get overlay() {
      return overlays[overlays.length - 1]?.id ?? null;
    },
    get shared() {
      return sharer.last;
    },
    get recording() {
      return sharer.recording;
    },
    dispose() {
      sharer.cancel(true);
      phase.exit();
    },
  };
}

export type { GameDeps } from './types';
